import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Write the sample run record the e2e test plays (served from public/runs). */
export default function globalSetup(): void {
  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const result = spawnSync(
    'npm',
    ['run', 'sim', '--', 'run', 'scenarios/vimy-1917/1cdn-3bde-draft.yaml', '--seed', '1', '--out', 'packages/app/public/runs/sample.json'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`sim run failed with status ${result.status}`);
}
