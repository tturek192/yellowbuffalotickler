import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runScenario } from '@wwi/engine';
import type { RunRecord } from '@wwi/engine';
import { atMinute, formatWhy } from './why';
import { explain } from '@wwi/engine/reader';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = (args: string[]) => {
  const r = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

import { vimy, vimyDoctrines } from '../../engine/src/test-helpers';
const record = (): RunRecord => runScenario(vimy(), vimyDoctrines(), { seed: 1 });

describe('sim why', () => {
  it('atMinute turns a clock time into minutes from the record zero hour', () => {
    expect(atMinute('2017-04-09T05:30', '05:30')).toBe(0);
    expect(atMinute('2017-04-09T05:30', '06:45')).toBe(75);
    expect(atMinute('2017-04-09T05:30', '05:00')).toBe(-30);
    expect(() => atMinute('2017-04-09T05:30', '25:00')).toThrow(/HH:MM/);
  });

  it('formatWhy prints an indented chain with causes in plain language', () => {
    const r = record();
    const pinned = r.events.find((e) => e.kind === 'company-pinned' && explain(r, { eventId: e.id }).because.length > 0)!;
    const out = formatWhy(explain(r, { eventId: pinned.id }), r.zeroHour);
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/^#\d+ /);
    expect(out).toMatch(/because: /);
    expect(lines.some((l) => l.startsWith('  '))).toBe(true);
    expect(out).toMatch(/the barrage had moved on|machine guns fired/);
  }, 60_000);

  it('prints the chain for --event and for --unit --at, and fails cleanly on bad input', () => {
    const r = record();
    const dir = mkdtempSync(join(tmpdir(), 'why-'));
    const file = join(dir, 'r.json');
    writeFileSync(file, JSON.stringify(r));
    const pinned = r.events.find((e) => e.kind === 'company-pinned')!;
    const a = cli(['why', file, '--event', String(pinned.id)]);
    expect(a.code).toBe(0);
    expect(a.stdout).toMatch(/pinned/i);
    const hh = (m: number) => { const t = new Date(Date.parse(`${r.zeroHour}:00Z`) + m * 60000); return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };
    const b = cli(['why', file, '--unit', pinned.unitId!, '--at', hh(pinned.minute)]);
    expect(b.code).toBe(0);
    expect(b.stdout).toMatch(/^#\d+ /);
    expect(cli(['why', file]).code).toBe(1);
    expect(cli(['why', file, '--event', '999999']).code).toBe(3);
  }, 60_000);
});
