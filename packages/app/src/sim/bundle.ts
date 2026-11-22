import { DoctrineSchema, LibrarySchema, parseScenarioData, ScenarioError, SourcesSchema, TablesSchema } from '@wwi/scenario';
import type { Doctrine, Library, Scenario, Sources, Tables } from '@wwi/scenario';

/** A scenario bundle as `sim bundle` writes it (cli/src/bundle.ts): all the browser needs to run the engine. */
export type Bundle = {
  bundleVersion: 1;
  scenario: Scenario;
  models: { doctrines: Record<string, Doctrine>; tables: Tables };
  tableSources: Sources;
  library: Library;
  notes: string;
  createdFrom: string;
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Validate a bundle's JSON with the scenario package's node-free schemas; a ScenarioError lists every problem found. */
export function parseBundle(json: unknown): Bundle {
  if (!isObject(json)) throw new ScenarioError(['bundle: expected a JSON object']);
  if (json.bundleVersion !== 1) throw new ScenarioError([`bundle: bundleVersion ${String(json.bundleVersion)} is not supported (this app reads bundleVersion 1)`]);
  const problems: string[] = [];
  const issues = (where: string, e: { issues: Array<{ path: PropertyKey[]; message: string }> }): void => {
    for (const i of e.issues) problems.push(`${where}${i.path.length ? `.${i.path.map(String).join('.')}` : ''}: ${i.message}`);
  };
  const models = isObject(json.models) ? json.models : null;
  if (!models || !isObject(models.doctrines) || !isObject(models.tables)) throw new ScenarioError(['bundle: models.doctrines and models.tables are required']);
  const tables = TablesSchema.safeParse(models.tables);
  if (!tables.success) issues('models.tables', tables.error);
  const doctrines: Record<string, Doctrine> = {};
  for (const [id, d] of Object.entries(models.doctrines)) {
    const r = DoctrineSchema.safeParse(d);
    if (r.success) doctrines[id] = r.data;
    else issues(`models.doctrines.${id}`, r.error);
  }
  const sources = SourcesSchema.safeParse(json.tableSources);
  if (!sources.success) issues('tableSources', sources.error);
  const library = LibrarySchema.safeParse(json.library);
  if (!library.success) issues('library', library.error);
  if (typeof json.notes !== 'string') problems.push('notes: expected a string');
  if (typeof json.createdFrom !== 'string') problems.push('createdFrom: expected a string');
  if (problems.length || !tables.success || !sources.success || !library.success) throw new ScenarioError(problems);
  // References and weapon ids are checked against the bundle's own doctrines and tables.
  const scenario = parseScenarioData(json.scenario, Object.keys(doctrines), undefined, tables.data);
  return {
    bundleVersion: 1,
    scenario,
    models: { doctrines, tables: tables.data },
    tableSources: sources.data,
    library: library.data,
    notes: json.notes as string,
    createdFrom: json.createdFrom as string,
  };
}
