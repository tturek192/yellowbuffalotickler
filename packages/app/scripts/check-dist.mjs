// List every file in dist/ with its size; fail when the total is over 60 MB or any one file is over 15 MB.
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MB = 1024 * 1024;
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const files = [];
const walk = (dir, rel) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}${e.name}/`, `${rel}${e.name}/`);
    else files.push({ path: `${rel}${e.name}`, size: statSync(`${dir}${e.name}`).size });
  }
};
walk(root, '');
files.sort((a, b) => a.path.localeCompare(b.path));
let total = 0;
const problems = [];
for (const f of files) {
  total += f.size;
  console.log(`${String(f.size).padStart(10)}  ${f.path}`);
  if (f.size > 15 * MB) problems.push(`${f.path} is ${(f.size / MB).toFixed(1)} MB (limit 15 MB)`);
}
console.log(`${String(total).padStart(10)}  total, ${files.length} files`);
if (total > 60 * MB) problems.push(`total is ${(total / MB).toFixed(1)} MB (limit 60 MB)`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
