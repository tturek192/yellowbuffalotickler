import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import type { Scenario, Doctrine } from './schema';
import { parseScenarioData, parseDoctrine, ScenarioError } from './load';
import { mergeScenarioParts } from './include';
import { FrameSchema } from './frame';
import { geoToScenarioParts, type GeoJsonFeatureCollection } from './geo';

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
  let mainData: unknown = null;
  try {
    mainData = parse(text);
  } catch (e) {
    throw new ScenarioError([`invalid YAML: ${(e as Error).message}`]);
  }
  const mainMap = mainData && typeof mainData === 'object' && !Array.isArray(mainData) ? (mainData as Record<string, unknown>) : null;
  const { include, ...mainRest } = mainMap ?? {};
  const parts: Array<{ file: string; data: unknown }> = [{ file: basename(path), data: mainMap ? mainRest : mainData }];
  const problems: string[] = [];
  if (include !== undefined) {
    if (!Array.isArray(include) || include.some((f) => typeof f !== 'string')) {
      problems.push('include: expected a list of file paths');
    } else {
      include.forEach((f: string, i) => {
        try {
          const data = parse(readFileSync(resolve(dirname(path), f), 'utf8'));
          if (data && typeof data === 'object' && 'include' in data) {
            problems.push(`include[${i}]: ${f} must not contain its own include`);
            return;
          }
          parts.push({ file: f, data });
        } catch (e) {
          problems.push(
            e instanceof YAMLParseError ? `include[${i}]: invalid YAML in ${f}: ${e.message}` : `include[${i}]: cannot read ${f}`,
          );
        }
      });
    }
  }
  const { merged, problems: mergeProblems } = mergeScenarioParts(parts);
  problems.push(...mergeProblems);
  const mergedMap = merged && typeof merged === 'object' && !Array.isArray(merged) ? (merged as Record<string, unknown>) : null;
  const geo = mergedMap?.geo;
  if (geo !== undefined) {
    if (!Array.isArray(geo) || geo.some((f) => typeof f !== 'string')) {
      problems.push('geo: expected a list of file paths');
    } else if (geo.length) {
      const fr = FrameSchema.safeParse(mergedMap!.frame);
      if (!fr.success) {
        problems.push('geo: a valid frame is required to read GeoJSON files');
      } else {
        for (const f of geo as string[]) {
          let fc: unknown;
          try {
            fc = JSON.parse(readFileSync(resolve(dirname(path), f), 'utf8'));
          } catch (e) {
            problems.push(e instanceof SyntaxError ? `geo: invalid JSON in ${f}: ${e.message}` : `geo: cannot read ${f}`);
            continue;
          }
          const r = geoToScenarioParts(fc as GeoJsonFeatureCollection, fr.data, f);
          problems.push(...r.problems);
          mergedMap!.lines = [...(Array.isArray(mergedMap!.lines) ? mergedMap!.lines : []), ...r.lines];
          mergedMap!.features = [...(Array.isArray(mergedMap!.features) ? mergedMap!.features : []), ...r.features];
        }
      }
    }
  }
  const structural = problems.length > 0; // a broken include would only cascade into noise
  const raw = merged as { forces?: { doctrine?: unknown }[] } | null;
  const ids = [
    ...new Set(
      (Array.isArray(raw?.forces) ? raw.forces : []).map((f) => f?.doctrine).filter((d): d is string => typeof d === 'string'),
    ),
  ];
  const doctrines: Record<string, Doctrine> = {};
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
    if (structural) throw new ScenarioError([]);
    // attempted ids count as known: their own failures are already reported above
    scenario = parseScenarioData(merged, ids);
  } catch (e) {
    if (!(e instanceof ScenarioError)) throw e;
    problems.push(...e.problems);
  }
  if (problems.length || !scenario) throw new ScenarioError(problems);
  return { scenario, doctrines };
}
