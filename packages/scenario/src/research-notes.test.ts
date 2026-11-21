import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const notesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/research/vimy');
const notes = readdirSync(notesDir).filter((f) => f.endsWith('.md') && f !== 'review.md');

/** Each quoted span in the "Quote" column of a note's value tables, with its line number. */
function quotes(md: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  let col = -1;
  md.split('\n').forEach((l, i) => {
    if (!l.startsWith('|')) return void (col = -1);
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const q = cells.findIndex((c) => /^Quote\b/.test(c));
    if (q >= 0) return void (col = q);
    if (col < 0 || /^-+$/.test(cells[0] ?? '')) return;
    for (const m of (cells[col] ?? '').matchAll(/"([^"]+)"/g)) out.push({ line: i + 1, text: m[1]! });
  });
  return out;
}

describe('Vimy research notes', () => {
  it('quote no more than 25 words at a time', () => {
    const long = notes.flatMap((f) =>
      quotes(readFileSync(resolve(notesDir, f), 'utf8'))
        .filter((q) => q.text.split(/\s+/).filter(Boolean).length > 25)
        .map((q) => `${f}:${q.line}: ${q.text.split(/\s+/).length} words`),
    );
    expect(notes.length).toBeGreaterThan(5);
    expect(long).toEqual([]);
  });
  it('ask the historian about the brown-2cdn stand-off artefact and the British 5th Division entered as a group', () => {
    const section = (f: string) => readFileSync(resolve(notesDir, f), 'utf8').split('## Open questions for the historian')[1] ?? '';
    expect(section('geometry.md')).toMatch(/brown-2cdn's northern section lies inside the barrage's stand-off beyond blue-2cdn/);
    expect(section('oob-canadian.md')).toMatch(/British 5th Division is entered as a `group`/);
  });
  it('do not refer the historian to plan task numbers in their open questions', () => {
    for (const f of notes) {
      const md = readFileSync(resolve(notesDir, f), 'utf8');
      const start = md.indexOf('## Open questions for the historian');
      if (start < 0) continue;
      const rest = md.slice(start + 1);
      const section = rest.slice(0, rest.search(/\n#{1,2} |$/));
      expect(section, f).not.toMatch(/\bTasks? \d|\bthis task\b/);
    }
  });
});

describe('model research notes', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/research/model');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  it('exist for the tables and the doctrine, each with Conflicts and Open questions for the historian', () => {
    expect(files).toEqual(expect.arrayContaining(['tables.md', 'doctrine.md']));
    for (const f of files) {
      const md = readFileSync(resolve(dir, f), 'utf8');
      expect(md, f).toMatch(/^## Conflicts$/m);
      expect(md, f).toMatch(/^## Open questions for the historian$/m);
    }
  });
  it('quote no more than 25 words at a time and refer to no plan task numbers in their open questions', () => {
    for (const f of files) {
      const md = readFileSync(resolve(dir, f), 'utf8');
      for (const q of quotes(md)) expect(q.text.split(/\s+/).filter(Boolean).length, `${f}:${q.line}`).toBeLessThanOrEqual(25);
      expect(md.split('## Open questions for the historian')[1], f).not.toMatch(/\bTasks? \d|\bthis task\b/);
    }
  });
});

