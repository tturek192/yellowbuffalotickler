import { parse } from 'yaml';
import type { z } from 'zod';
import { ScenarioSchema, type Scenario } from './schema';
import { DoctrineSchema, type Doctrine } from './doctrine';
import { checkReferences, collectSourceRefs } from './references';
import type { Tables } from './tables';

export class ScenarioError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ScenarioError';
  }
}

/** A zod error as problems, each `path: message` (`ops[0].factor: …`); `locate` rewrites each path. */
export const formatIssues = (e: z.ZodError, locate: (path: string) => string = (p) => p) =>
  e.issues.flatMap((i) =>
    // An unknown section at the root: one problem per key, located in the file that holds it.
    i.code === 'unrecognized_keys' && i.path.length === 0
      ? i.keys.map((k) => `${locate(k)}: unknown section "${k}" (misspelt?)`)
      : [`${i.path.length ? locate(i.path.reduce<string>((a, p) => (typeof p === 'number' ? `${a}[${p}]` : a ? `${a}.${String(p)}` : String(p)), '')) : '(root)'}: ${i.message}`],
  );

export function parseYaml(text: string): unknown {
  try {
    return parse(text);
  } catch (e) {
    throw new ScenarioError([`invalid YAML: ${(e as Error).message}`]);
  }
}

export function parseScenario(yamlText: string, doctrineIds: string[]): Scenario {
  return parseScenarioData(parseYaml(yamlText), doctrineIds);
}

/**
 * Validate an already-parsed (and, for multi-file scenarios, merged) scenario document. `locate` rewrites each
 * problem's path to name its file and the index within it (see Provenance in include.ts); with `tables`, weapon ids
 * are checked against them.
 */
export function parseScenarioData(data: unknown, doctrineIds: string[], locate?: (path: string) => string, tables?: Pick<Tables, 'weapons'>): Scenario {
  const r = ScenarioSchema.safeParse(data);
  if (!r.success) throw new ScenarioError(formatIssues(r.error, locate));
  const problems = checkReferences(r.data, doctrineIds, locate, tables);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}

export function parseDoctrine(yamlText: string): Doctrine {
  const r = DoctrineSchema.safeParse(parseYaml(yamlText));
  if (!r.success) throw new ScenarioError(formatIssues(r.error));
  const known = new Set(Object.keys(r.data.sources));
  const problems = collectSourceRefs(r.data, '')
    .filter((x) => !known.has(x.id))
    .map((x) => `${x.path}: unknown source "${x.id}"`);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}
