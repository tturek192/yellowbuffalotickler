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
  it('atMinute reads HH:MM on a one-day record, and a day plus time (CLI or ISO form) on a longer one', () => {
    const z = '2017-04-09T05:30';
    expect(atMinute(z, '05:30', 600)).toBe(0);
    expect(atMinute(z, '06:45', 600)).toBe(75);
    expect(atMinute(z, '05:00', 600)).toBe(-30);
    expect(() => atMinute(z, '25:00', 600)).toThrow(/HH:MM/);
    expect(atMinute(z, '10 Apr 14:00', 5070)).toBe(24 * 60 + 8 * 60 + 30);
    expect(atMinute(z, '2017-04-10T14:00', 5070)).toBe(24 * 60 + 8 * 60 + 30);
    expect(atMinute(z, '09 Apr 06:00', 5070)).toBe(30);
  });

  it('atMinute fails loudly on a bare time for a multi-day record, and on a time after the record ends', () => {
    const z = '2017-04-09T05:30';
    expect(() => atMinute(z, '14:00', 5070)).toThrow(/spans 2017-04-09 to 2017-04-12.*10 Apr 14:00/);
    expect(() => atMinute(z, '13 Apr 14:00', 5070)).toThrow(/after the record ends/);
    expect(() => atMinute(z, '20:00', 600)).toThrow(/after the record ends/);
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
    const iso = (m: number) => new Date(Date.parse(`${r.zeroHour}:00Z`) + m * 60000).toISOString().slice(0, 16);
    const b = cli(['why', file, '--unit', pinned.unitId!, '--at', iso(pinned.minute)]);
    expect(b.code).toBe(0);
    expect(b.stdout).toMatch(/^#\d+ /);
    expect(cli(['why', file]).code).toBe(1);
    // A later day resolves to that day's event, not the zero day's; a bare time on a multi-day record fails loudly.
    const late = r.events.filter((e) => e.unitId !== undefined && e.minute > 24 * 60).at(-1)!;
    const c = cli(['why', file, '--unit', late.unitId!, '--at', iso(late.minute)]);
    expect(c.code).toBe(0);
    expect(c.stdout).toMatch(new RegExp(`^#${late.id} `));
    const d = cli(['why', file, '--unit', late.unitId!, '--at', '14:00']);
    expect(d.code).toBe(3);
    expect(d.stderr).toMatch(/ambiguous.*spans/);
    expect(cli(['why', file, '--event', '999999']).code).toBe(3);
  }, 60_000);
});
