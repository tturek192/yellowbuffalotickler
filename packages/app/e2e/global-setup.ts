import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

/** Write the run records the e2e tests play. */
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
}
