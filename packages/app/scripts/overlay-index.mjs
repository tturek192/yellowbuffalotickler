// Write public/overlays/<id>.json for every what-if preset in the repo's overlays/*.yaml, and public/overlays/index.json,
// the list the "Run a battle" panel offers. (JSON is YAML, so the app reads each file with the scenario package's parseOverlay.)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const src = fileURLToPath(new URL('../../../overlays/', import.meta.url));
const dir = fileURLToPath(new URL('../public/overlays/', import.meta.url));
mkdirSync(dir, { recursive: true });
const index = [];
for (const name of readdirSync(src).filter((f) => f.endsWith('.yaml')).sort()) {
  const overlay = parse(readFileSync(`${src}${name}`, 'utf8'));
  writeFileSync(`${dir}${overlay.id}.json`, JSON.stringify(overlay));
  index.push({ id: overlay.id, file: `${overlay.id}.json`, title: overlay.title, scenarioId: overlay.scenarioId });
}
writeFileSync(`${dir}index.json`, JSON.stringify(index));
