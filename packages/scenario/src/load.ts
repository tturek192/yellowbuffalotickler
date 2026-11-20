import { readFileSync } from 'node:fs';
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

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

export function parseScenario(yamlText: string, doctrineIds: string[]): Scenario {
  const r = ScenarioSchema.safeParse(parse(yamlText));
  if (!r.success) throw new ScenarioError(issues(r.error));
  const problems = checkReferences(r.data, doctrineIds);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}

function parseDoctrine(yamlText: string, label: string): Doctrine {
  const r = DoctrineSchema.safeParse(parse(yamlText));
  if (!r.success) throw new ScenarioError(issues(r.error).map((m) => `${label}: ${m}`));
  const known = new Set(Object.keys(r.data.sources));
  const problems = collectSourceRefs(r.data, '')
    .filter((x) => !known.has(x.id))
    .map((x) => `${label}: ${x.path}: unknown source "${x.id}"`);
  if (problems.length) throw new ScenarioError(problems);
  return r.data;
}

export function loadScenario(
  path: string,
  doctrineDir: string,
): { scenario: Scenario; doctrines: Record<string, Doctrine> } {
  const raw = parse(readFileSync(path, 'utf8')) as { forces?: { doctrine?: unknown }[] } | null;
  const ids = [
    ...new Set((raw?.forces ?? []).map((f) => f.doctrine).filter((d): d is string => typeof d === 'string')),
  ];
  const doctrines: Record<string, Doctrine> = {};
  const available: string[] = [];
  const problems: string[] = [];
  for (const id of ids) {
    try {
      doctrines[id] = parseDoctrine(readFileSync(`${doctrineDir}/${id}.yaml`, 'utf8'), `doctrine ${id}`);
      available.push(id);
    } catch (e) {
      if (e instanceof ScenarioError) problems.push(...e.problems);
      else problems.push(`doctrine ${id}: cannot read ${doctrineDir}/${id}.yaml`);
    }
  }
  let scenario: Scenario | undefined;
  try {
    scenario = parseScenario(readFileSync(path, 'utf8'), available);
  } catch (e) {
    if (e instanceof ScenarioError) problems.push(...e.problems);
    else throw e;
  }
  if (problems.length || !scenario) throw new ScenarioError(problems);
  return { scenario, doctrines };
}
