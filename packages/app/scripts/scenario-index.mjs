// Write public/scenarios/index.json, the list of scenario bundles the app offers (each written by `sim bundle`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/scenarios/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}index.json`,
  JSON.stringify([
    { id: 'vimy-1917', file: 'vimy-1917.json', title: 'Vimy Ridge, 9 April 1917' },
    { id: 'draft', file: 'draft.json', title: 'Vimy Ridge: 1st Canadian Division, 3rd Brigade (draft)' },
  ]),
);
