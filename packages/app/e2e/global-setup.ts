import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashRecord } from '../../engine/src/hash';

/** Scenario files (from the repo root) and the run names the e2e tests play (served from public/runs). */
const RUNS: Array<[scenario: string, run: string]> = [
  ['scenarios/vimy-1917/1cdn-3bde-draft.yaml', 'sample'],
  // The draft plus synthetic features of every kind and a holding German garrison.
  ['packages/app/e2e/fixtures/garrisons.yaml', 'garrisons'],
  // The Vimy scenario itself: hundreds of companies in over a hundred battalions.
  ['scenarios/vimy-1917/scenario.yaml', 'vimy'],
];

/** Scenario files and the bundle names the app loads (public/scenarios), then the index that lists them. */
const BUNDLES: Array<[scenario: string, bundle: string]> = [
  ['scenarios/vimy-1917/scenario.yaml', 'vimy-1917'],
  ['scenarios/vimy-1917/1cdn-3bde-draft.yaml', 'draft'],
];

/** The what-if run the browser must match byte for byte (batch.spec.ts): Vimy, seed 1, with this overlay. */
export const CLI_HASH_OVERLAY = 'overlays/vimy-germans-x2.yaml';
/** Where its hash is written (e2e/out, not served). */
export const CLI_HASH_FILE = 'packages/app/e2e/out/cli-hash.json';

/** Write the run records the e2e tests play, the scenario bundles, and the CLI's hash of the what-if run. */
export default function globalSetup(): void {
  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  for (const [scenario, run] of RUNS) {
    const result = spawnSync(
      'npm',
      ['run', 'sim', '--', 'run', scenario, '--seed', '1', '--out', `packages/app/public/runs/${run}.json`],
      { cwd: repoRoot, stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error(`sim run of ${scenario} failed with status ${result.status}`);
  }
  // Playwright's webServer runs `npx vite`, so the `predev` that writes these for `npm run dev` never runs for e2e.
  for (const [scenario, bundle] of BUNDLES) {
    const result = spawnSync('npm', ['run', 'sim', '--', 'bundle', scenario, '--out', `packages/app/public/scenarios/${bundle}.json`], { cwd: repoRoot, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`sim bundle of ${scenario} failed with status ${result.status}`);
  }
  const index = spawnSync('node', ['packages/app/scripts/scenario-index.mjs'], { cwd: repoRoot, stdio: 'inherit' });
  if (index.status !== 0) throw new Error(`writing the scenario index failed with status ${index.status}`);
  const presets = spawnSync('node', ['packages/app/scripts/overlay-index.mjs'], { cwd: repoRoot, stdio: 'inherit' });
  if (presets.status !== 0) throw new Error(`writing the what-if presets failed with status ${presets.status}`);
  // The CLI's record of the what-if run, hashed as written (`sim run` writes JSON.stringify(record)).
  const whatIf = 'packages/app/e2e/out/vimy-germans-x2.json';
  mkdirSync(`${repoRoot}packages/app/e2e/out`, { recursive: true });
  const run = spawnSync('npm', ['run', 'sim', '--', 'run', 'scenarios/vimy-1917/scenario.yaml', '--seed', '1', '--overlay', CLI_HASH_OVERLAY, '--out', whatIf], { cwd: repoRoot, stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`sim run with ${CLI_HASH_OVERLAY} failed with status ${run.status}`);
  writeFileSync(`${repoRoot}${CLI_HASH_FILE}`, JSON.stringify({ overlay: CLI_HASH_OVERLAY, seed: 1, cliHash: hashRecord(readFileSync(`${repoRoot}${whatIf}`, 'utf8')) }));
}
