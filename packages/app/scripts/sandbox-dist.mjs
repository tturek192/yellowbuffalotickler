// Turns the multi-page Vite build into a stand-alone sandbox site: dist-sandbox/index.html plus the assets it loads.
// node scripts/sandbox-dist.mjs [--check]   (--check only verifies an existing dist-sandbox/)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const here = new URL('..', import.meta.url).pathname, dist = join(here, 'dist'), out = join(here, 'dist-sandbox');
if (!process.argv.includes('--check')) {
  if (!existsSync(join(dist, 'sandbox.html'))) throw new Error('Build first: vite build (dist/sandbox.html is missing)');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), readFileSync(join(dist, 'sandbox.html')));
  cpSync(join(dist, 'assets'), join(out, 'assets'), { recursive: true });
}
const html = readFileSync(join(out, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
const bad = refs.filter(r => /^(https?:)?\/\//.test(r) || r.startsWith('/'));
if (bad.length) throw new Error(`index.html loads from outside its folder: ${bad.join(', ')}`);
for (const r of refs) if (!existsSync(join(out, r))) throw new Error(`missing ${r}`);
let total = 0; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else total += s.size; } }; walk(out);
if (total > 15e6) throw new Error(`dist-sandbox is ${(total / 1e6).toFixed(1)} MB, over 15 MB`);
console.log(`dist-sandbox ok: ${(total / 1e6).toFixed(2)} MB, ${refs.length} references, all local`);
