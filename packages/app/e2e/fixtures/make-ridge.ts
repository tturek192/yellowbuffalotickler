/** Writes terrain/ridge.json, the synthetic ridge the garrisons e2e fixture is drawn on: npx tsx packages/app/e2e/fixtures/make-ridge.ts */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, encodeTerrain } from '@wwi/scenario';

const FORMULA =
  'crest at x = 2000 + 150 sin(y/700); west of it 140 - 65(1 - e^(d/1400)), east of it 55 + 85 e^-(d/450)^2 (d = x - crest); ' +
  '+6 e^-(r/350)^2 knoll at (2050, 1000); -10 m re-entrant along y = 250 on the western slope; ' +
  '+1.5 sin(x/310 + y/470) + 1.2 sin(x/530 - y/290) + 0.8 sin((x + y)/170)';

function z(x: number, y: number): number {
  const crest = 2000 + 150 * Math.sin(y / 700);
  const d = x - crest;
  let h = d < 0 ? 140 - 65 * (1 - Math.exp(d / 1400)) : 55 + 85 * Math.exp(-((d / 450) ** 2));
  h += 6 * Math.exp(-(((x - 2050) ** 2 + (y - 1000) ** 2) / 350 ** 2));
  h -= 10 * Math.exp(-(((y - 250) / 200) ** 2)) * Math.min(Math.max(-d / 1500, 0), 1);
  h += 1.5 * Math.sin(x / 310 + y / 470) + 1.2 * Math.sin(x / 530 - y / 290) + 0.8 * Math.sin((x + y) / 170);
  return h;
}

const cellM = 25, minX = -1200, maxX = 4200, minY = -1200, maxY = 2400;
const cols = (maxX - minX) / cellM, rows = (maxY - minY) / cellM;
const originX = minX + cellM / 2, originY = minY + cellM / 2;
const elevM: number[] = [];
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) elevM.push(z(originX + i * cellM, originY + j * cellM));
const grid = {
  source: { source: 'synthetic-terrain', note: 'not real terrain' },
  method: `Synthetic Vimy-like ridge for the e2e visual check, sampled at ${cellM} m cell centres: ${FORMULA}`,
  ...encodeTerrain({ cellM, originX, originY, cols, rows, elevM }),
};
const out = fileURLToPath(new URL('./terrain/ridge.json', import.meta.url));
writeFileSync(out, JSON.stringify(grid, null, 2) + '\n');
const t = decodeTerrain(grid);
console.log(`wrote ${out}: ${cols} × ${rows} cells, ${t.min}…${t.max} m`);
