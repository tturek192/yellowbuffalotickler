import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parse, YAMLParseError } from 'yaml';
import type { Scenario } from './schema';
import type { Doctrine } from './doctrine';
import { parseScenarioData, parseDoctrine, ScenarioError } from './load';
import { mergeScenarioParts, locateProblem } from './include';
import { FrameSchema, projectLonLatPlacements, type Frame } from './frame';
import { terrainGridProblem, type TerrainGrid } from './terrain';
import { TablesSchema, type Tables } from './tables';
import { SourcesSchema } from './schema';
import { collectSourceRefs } from './references';
import { geoToScenarioParts, type GeoJsonFeatureCollection } from './geo';

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * Read and check the terrain grid file named by `terrain` (relative to the scenario file). A grid must
 * cover the frame's extent: its cells reach half a cell beyond the outermost sample points.
 */
function readTerrain(scenarioPath: string, file: unknown, frame: Frame | undefined, problems: string[]): TerrainGrid | undefined {
  if (typeof file !== 'string') return void problems.push('terrain: expected a file path');
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(resolve(dirname(scenarioPath), file), 'utf8'));
  } catch (e) {
    return void problems.push(e instanceof SyntaxError ? `terrain: invalid JSON in ${file}: ${e.message}` : `terrain: cannot read ${file}`);
  }
  const problem = terrainGridProblem(data);
  if (problem) return void problems.push(`terrain: ${file}: ${problem}`);
  const g = data as TerrainGrid;
  if (frame) {
    const half = g.cellM / 2;
    const has = { minX: g.originX - half, maxX: g.originX + (g.cols - 1) * g.cellM + half, minY: g.originY - half, maxY: g.originY + (g.rows - 1) * g.cellM + half };
    const e = frame.extent;
    const eps = 1e-6;
    if (has.minX > e.minX + eps || has.maxX < e.maxX - eps || has.minY > e.minY + eps || has.maxY < e.maxY - eps) {
      problems.push(
        `terrain: ${file}: the grid covers x ${fmt(has.minX)}…${fmt(has.maxX)}, y ${fmt(has.minY)}…${fmt(has.maxY)} ` +
          `but the frame extent is x ${fmt(e.minX)}…${fmt(e.maxX)}, y ${fmt(e.minY)}…${fmt(e.maxY)}`,
      );
    }
  }
  return g;
}

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
  const { merged, problems: mergeProblems, provenance } = mergeScenarioParts(parts);
  const locate = (p: string) => provenance.locate(p);
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
          for (const key of ['lines', 'features'] as const) {
            const before = Array.isArray(mergedMap![key]) ? (mergedMap![key] as unknown[]) : [];
            const added: Array<{ id: string }> = r[key];
            provenance.addSegment(key, f, before.length, added.length, added.map((x) => x.id));
            mergedMap![key] = [...before, ...added];
          }
        }
      }
    }
  }
  const frameParsed = FrameSchema.safeParse(mergedMap?.frame);
  if (mergedMap?.terrain !== undefined) {
    const grid = readTerrain(path, mergedMap.terrain, frameParsed.success ? frameParsed.data : undefined, problems);
    if (grid) mergedMap.terrainGrid = grid;
  }
  problems.push(...projectLonLatPlacements(merged, frameParsed.success ? frameParsed.data : undefined).map((p) => locateProblem(p, locate)));
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
    scenario = parseScenarioData(merged, ids, locate);
  } catch (e) {
    if (!(e instanceof ScenarioError)) throw e;
    problems.push(...e.problems);
  }
  if (problems.length || !scenario) throw new ScenarioError(problems);
  return { scenario, doctrines };
}

/**
 * Load and merge every `*.yaml` file in a tables directory (files in name order). Each file holds any of the
 * `weapons`, `cover`, `channels` and `effects` sections; one entry (a weapon id, a cover posture, a channel
 * kind, an effect key) may be defined in one file only. Problems name the file that defined the entry.
 */
const TABLE_SECTIONS = ['sources', 'weapons', 'cover', 'channels', 'effects'];

export function loadTables(dir: string): Tables {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  } catch {
    throw new ScenarioError([`cannot read tables directory ${dir}`]);
  }
  const problems: string[] = [];
  const merged: Record<string, Record<string, unknown>> = {};
  const owner = new Map<string, string>();
  for (const file of files) {
    let data: unknown;
    try {
      data = parse(readFileSync(resolve(dir, file), 'utf8'));
    } catch (e) {
      problems.push(e instanceof YAMLParseError ? `${file}: invalid YAML: ${e.message}` : `${file}: cannot read`);
      continue;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      problems.push(`${file}: expected a mapping at the top level`);
      continue;
    }
    for (const [section, entries] of Object.entries(data)) {
      if (!TABLE_SECTIONS.includes(section)) {
        problems.push(`${file}: ${section}: unknown section (expected ${TABLE_SECTIONS.join(', ')})`);
        continue;
      }
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
        problems.push(`${file}: ${section}: expected a mapping`);
        continue;
      }
      const target = (merged[section] ??= {});
      for (const [key, val] of Object.entries(entries)) {
        const path = `${section}.${key}`;
        const first = owner.get(path);
        if (first !== undefined) problems.push(`${path}: "${key}" is defined in ${first} and ${file}`);
        else {
          owner.set(path, file);
          target[key] = val;
        }
      }
    }
  }
  const { sources = {}, ...model } = merged;
  const sourcesParsed = SourcesSchema.safeParse(sources);
  if (!sourcesParsed.success) {
    for (const i of sourcesParsed.error.issues) {
      const file = owner.get(`sources.${String(i.path[0])}`);
      problems.push(`${file ? `${file}: ` : ''}sources.${i.path.join('.')}: ${i.message}`);
    }
  }
  for (const ref of collectSourceRefs(model, '')) {
    if (!(ref.id in sources)) {
      const file = owner.get(ref.path.split('.').slice(0, 2).join('.'));
      problems.push(`${file ? `${file}: ` : ''}${ref.path}: unknown source "${ref.id}"`);
    }
  }
  const r = TablesSchema.safeParse(model);
  if (!r.success) {
    for (const i of r.error.issues) {
      const path = i.path.reduce<string>((a, p) => (typeof p === 'number' ? `${a}[${p}]` : a ? `${a}.${String(p)}` : String(p)), '');
      const keyPaths = i.code === 'unrecognized_keys' ? i.keys.map((k) => [...i.path, k].join('.')) : [i.path.slice(0, 2).join('.')];
      const file = keyPaths.map((k) => owner.get(k)).find((f) => f !== undefined);
      problems.push(`${file ? `${file}: ` : ''}${path || '(root)'}: ${i.message}`);
    }
  }
  if (problems.length) throw new ScenarioError(problems);
  return r.data!;
}
