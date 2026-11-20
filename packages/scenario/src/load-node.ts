import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { Scenario, Doctrine } from './schema';
import { parseScenario, parseDoctrine, ScenarioError } from './load';

export function loadScenario(
  path: string,
  doctrineDir: string,
): { scenario: Scenario; doctrines: Record<string, Doctrine> } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ScenarioError([`cannot read ${path}`]);
  }
  let raw: { forces?: { doctrine?: unknown }[] } | null = null;
  try {
    raw = parse(text);
  } catch {
    /* parseScenario below reports the syntax error */
  }
  const ids = [
    ...new Set((raw?.forces ?? []).map((f) => f?.doctrine).filter((d): d is string => typeof d === 'string')),
  ];
  const doctrines: Record<string, Doctrine> = {};
  const problems: string[] = [];
  for (const id of ids) {
    const file = `${doctrineDir}/${id}.yaml`;
    let dtext: string;
    try {
      dtext = readFileSync(file, 'utf8');
    } catch {
      problems.push(`doctrine ${id}: cannot read ${file}`);
      continue;
    }
    try {
      doctrines[id] = parseDoctrine(dtext);
    } catch (e) {
      if (!(e instanceof ScenarioError)) throw e;
      problems.push(...e.problems.map((m) => `doctrine ${id}: ${m}`));
    }
  }
  let scenario: Scenario | undefined;
  try {
    // attempted ids count as known: their own failures are already reported above
    scenario = parseScenario(text, ids);
  } catch (e) {
    if (!(e instanceof ScenarioError)) throw e;
    problems.push(...e.problems);
  }
  if (problems.length || !scenario) throw new ScenarioError(problems);
  return { scenario, doctrines };
}
