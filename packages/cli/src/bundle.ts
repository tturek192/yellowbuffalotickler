import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Doctrine, Library, Scenario, Sources, Tables } from '@wwi/scenario';
import { loadDoctrine, loadLibrary, loadScenario, loadTables } from '@wwi/scenario/node';

/**
 * A scenario bundle: everything the browser needs to run the engine with no Node (Plan 4 Task 4). `models.tables` has
 * no `sources` key (TablesSchema is strict); the sources registry is `tableSources`, for the inspector.
 */
export type Bundle = {
  bundleVersion: 1;
  scenario: Scenario;
  models: { doctrines: Record<string, Doctrine>; tables: Tables };
  tableSources: Sources;
  library: Library;
  notes: string;
  createdFrom: string;
};

export type BundleFiles = { scenarioFile: string; doctrineDir: string; tablesDir: string; libraryDir: string };

/** Load the merged, projected and validated scenario, every doctrine in the doctrine directory, the tables and the library. */
export function buildBundle(f: BundleFiles): Bundle {
  const { sources, ...tables } = loadTables(f.tablesDir);
  const { scenario } = loadScenario(f.scenarioFile, f.doctrineDir, tables);
  // Every doctrine, not only those the scenario's forces name, so a `doctrine` op can resolve.
  const doctrines: Record<string, Doctrine> = {};
  for (const file of readdirSync(f.doctrineDir).filter((x) => x.endsWith('.yaml')).sort()) doctrines[basename(file, '.yaml')] = loadDoctrine(join(f.doctrineDir, file));
  // The owner's historical notes, if the scenario folder has any; never invented.
  const notesFile = join(dirname(f.scenarioFile), 'notes.md');
  return {
    bundleVersion: 1,
    scenario,
    models: { doctrines, tables },
    tableSources: sources,
    library: loadLibrary(f.libraryDir),
    notes: existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : '',
    createdFrom: f.scenarioFile,
  };
}
