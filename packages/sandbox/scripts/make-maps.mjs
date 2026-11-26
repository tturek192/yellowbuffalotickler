// Writes the four ready-made maps to src/maps/*.json (run once; the JSON is committed).
import { writeFileSync } from 'node:fs';
const W = 90, H = 60;
const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const smooth = (x, y, s, f) => { const gx = x / f, gy = y / f, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
  const v = (a, b) => hash(a, b, s); const l = (a, b, t) => a + (b - a) * t;
  return l(l(v(x0, y0), v(x0 + 1, y0), tx), l(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty); };
function make(id, title, height, ground, strongholds) {
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = Math.round(height(x, y) + (smooth(x, y, id.length, 9) - 0.5) * 6);
    cells.push({ h, t: ground(x, y, h) });
  }
  writeFileSync(new URL(`../src/maps/${id}.json`, import.meta.url), JSON.stringify({ id, title, cellM: 100, w: W, h: H, cells, attackerEdge: 'west', strongholds }));
}
const woods = (x, y, s, f = 0.72) => smooth(x, y, s, 6) > f;
const village = (x, y, list) => list.some(([vx, vy]) => Math.abs(x - vx) <= 1 && Math.abs(y - vy) <= 1);
make('ridge', 'The Ridge', (x) => 60 + 70 * Math.exp(-(((x - 58) / 13) ** 2)) + (x > 58 ? 15 : 0),
  (x, y) => village(x, y, [[20, 15], [72, 40], [68, 12]]) ? 'village' : x > 62 && woods(x, y, 3, 0.62) ? 'wood' : woods(x, y, 5) ? 'wood' : 'open',
  [{ id: 'crest', name: 'Hill 145', x: 5800, y: 3000 }]);
make('open', 'Open Ground', (x) => 80 + x * 0.15,
  (x, y) => village(x, y, [[30, 20], [55, 35], [70, 18], [62, 48]]) ? 'village' : woods(x, y, 7, 0.8) ? 'wood' : 'open',
  [{ id: 'village', name: 'Le Village', x: 5500, y: 3500 }]);
const riverX = (y) => Math.round(46 + 4 * Math.sin(y / 9));
make('river', 'The River Line', () => 50,
  (x, y) => (y === 18 || y === 42) ? (x === riverX(y) || x >= riverX(y) - 3 && x <= riverX(y) + 6 ? 'road' : village(x, y, [[riverX(y) + 5, y]]) ? 'village' : 'open')
    : x === riverX(y) ? 'river' : village(x, y, [[riverX(18) + 6, 20], [riverX(42) + 6, 44], [20, 30]]) ? 'village' : woods(x, y, 9, 0.78) ? 'wood' : 'open',
  [{ id: 'bridge', name: 'Bridge Town', x: (riverX(18) + 6) * 100 + 50, y: 2050 }]);
make('wooded-hill', 'The Wooded Hill', (x, y) => 70 + 55 * Math.exp(-(((x - 60) ** 2 + (y - 30) ** 2) / 220)),
  (x, y, h) => village(x, y, [[25, 20], [40, 45]]) ? 'village' : h > 95 ? 'wood' : woods(x, y, 11) ? 'wood' : 'open',
  [{ id: 'summit', name: 'The Summit', x: 6000, y: 3000 }]);
