import { parse } from 'yaml';
import type { z } from 'zod';
import { ScenarioSchema, DoctrineSchema, type Scenario, type Doctrine } from './schema';
import { checkReferences, collectSourceRefs } from './references';

export class ScenarioError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ScenarioError';
  }
}

const issues = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.length ? i.path.reduce<string>((a, p) => (typeof p === 'number' ? `${a}[${p}]` : a ? `${a}.${String(p)}` : String(p)), '') : '(root)'}: ${i.message}`);

function parseYaml(text: string): unknown {
  try {
    return parse(text);
  } catch (e) {
    throw new ScenarioError([`invalid YAML: ${(e as Error).message}`]);
  }
}

export function parseScenario(yamlText: string, doctrineIds: string[]): Scenario {
  return parseScenarioData(parseYaml(yamlText), doctrineIds);
}

/** Validate an already-parsed (and, for multi-file scenarios, merged) scenario document. */
export function parseScenarioData(data: unknown, doctrineIds: string[]): Scenario {
  const r = ScenarioSchema.safeParse(data);
  if (!r.success) throw new ScenarioError(issues(r.error));
  const problems = checkReferences(r.data, doctrineIds);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}

export function parseDoctrine(yamlText: string): Doctrine {
  const r = DoctrineSchema.safeParse(parseYaml(yamlText));
  if (!r.success) throw new ScenarioError(issues(r.error));
  const known = new Set(Object.keys(r.data.sources));
  const problems = collectSourceRefs(r.data, '')
    .filter((x) => !known.has(x.id))
    .map((x) => `${x.path}: unknown source "${x.id}"`);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}
