import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, loadTables as loadTablesAt } from './load-node';
import { allFormations, attackingCompanies, companiesOf, formation } from './queries';
import { checkReferences as checkRefs } from './references';
import { buildReview } from './review';
import type { Scenario } from './schema';
import type { Tables } from './tables';
import { v } from './sourced';
import { parseLocalDateTime } from './local-time';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let cached: ReturnType<typeof loadScenario> | undefined;
const loaded = () => (cached ??= loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine')));
function vimy(): Scenario {
  return loaded().scenario;
}
/** The brief's calls name repo-relative paths and a two-argument checkReferences; adapt both (as Plan 3 Task 1 ruled). */
const loadTables = (dir: string) => loadTablesAt(resolve(repoRoot, dir));
const checkReferences = (s: Scenario, t: Tables) => checkRefs(s, Object.keys(loaded().doctrines), undefined, t);

const company = (id: string) => {
  for (const f of allFormations(vimy())) for (const c of f.companies ?? []) if (c.id === id) return c;
  throw new Error(`no company ${id}`);
};

describe('Vimy command, planned operations, flanks and end conditions (Plan 3 Task 4)', () => {
  it('no improvised attack is scripted: no company starts after Zero + 600 except through an operation', () => {
    for (const c of attackingCompanies(vimy())) expect(v(c.startAfterMin!)).toBeLessThan(600);
  });
  it('every operation cites a written plan and its target resolves', () => {
    for (const o of vimy().operations!) { expect('source' in o.plan || 'estimate' in o.plan).toBe(true); }
    expect(checkReferences(vimy(), loadTables('tables'))).toEqual([]);
  });
  it('key ground includes Hill 145 and the Pimple', () => {
    expect(vimy().end!.keyGround.map(k => k.featureId)).toEqual(expect.arrayContaining(['hill-145', 'the-pimple']));
    // Task 15 (fix round): each piece of key ground cites what makes it key.
    for (const k of vimy().end!.keyGround) expect(k.cite).toMatchObject({ source: 'nicholson-1962', page: '245' });
  });

  // Guards beside the brief's three tests.
  it("the evening attackers (the 85th's C and D, the 46th's A and B) are reserve companies with no timetable", () => {
    for (const id of ['85bn-c', '85bn-d', '46bn-a', '46bn-b']) {
      const c = company(id);
      expect(c.role, id).toBe('reserve');
      expect(c.startAfterMin, id).toBeUndefined();
      expect(c.objectiveLineId, id).toBeUndefined();
    }
  });
  it("the 10th Brigade's battalions (44th, 46th, 47th, 50th) are all reserve companies, so the Pimple is left to its operation", () => {
    for (const bn of ['44bn', '46bn', '47bn', '50bn']) {
      for (const c of formation(vimy(), bn).companies!) expect(c.role, c.id).toBe('reserve');
    }
  });
  it("the 10th Brigade's Pimple attack is a planned operation, after the 4th Division's final objective, citing First Army Order No. 103", () => {
    const o = vimy().operations!.find(x => x.formationId === '10bde')!;
    expect(o.target).toEqual({ featureId: 'the-pimple' });
    expect(o.prerequisite).toEqual({ lineId: 'red-4cdn', sectorId: 'barrage-4cdn' });
    expect(o.plan).toMatchObject({ source: 'boh-1917-appendices' });
  });
  it('keeps the evening attack as a target: the Black Line on Hill 145 cannot fall before the 85th went over at 6.45 p.m.', () => {
    const o = vimy().historical.objectives.find(x => x.lineId === 'black-4cdn')!;
    expect(v(o.earliest)).toBe('1917-04-09T18:45');
  });
  it('every side has a channel from its battalions upward, and no link is empty', () => {
    const links = vimy().communications!.links;
    for (const side of ['allied', 'central'] as const) {
      expect(links.some(l => l.side === side && l.from === 'battalion'), side).toBe(true);
    }
    for (const l of links) expect(l.channels.length, `${l.side} ${l.from}->${l.to}`).toBeGreaterThan(0);
  });
  it('the local clock is an hour ahead of UTC (Summer Time), sourced', () => {
    const u = vimy().utcOffsetMin!;
    expect(u.value).toBe(60);
    expect('source' in u).toBe(true);
  });
  it('has off-map fire and attacks, air control and a lull, each with its reasoning', () => {
    const s = vimy();
    expect(s.offMap!.fire.length).toBeGreaterThan(0);
    expect(s.offMap!.attacks.map(a => a.targetFeatureId)).toContain('the-pimple');
    expect(s.air!.observedFrac.value).toBeGreaterThan(0);
    expect(v(s.end!.lullMin)).toBeGreaterThan(0);
    // Only the German side's companies are garrisons; no German company was turned into an attacker by an operation.
    for (const c of companiesOf(s, 'central')) expect(c.role).toBe('garrison');
  });
  it('Willerval waits for the heavy guns on the ridge (App. 29 para. 4); Vimy is the rapid-withdrawal case (para. 6)', () => {
    const ops = vimy().operations!;
    const willerval = ops.find(o => o.id === '5bdiv-willerval')!, vimyOp = ops.find(o => o.id === '5bdiv-vimy')!;
    expect(parseLocalDateTime(willerval.notBefore!).getTime()).toBeGreaterThanOrEqual(parseLocalDateTime('1917-04-12T00:00').getTime());
    expect(willerval.plan).toMatchObject({ page: expect.stringMatching(/para\. 4/) });
    expect(vimyOp.plan).toMatchObject({ page: expect.stringMatching(/para\. 6/) });
  });
  it('the time cap reaches past the lull, the off-map windows and the historical end', () => {
    const s = vimy();
    const zero = parseLocalDateTime(v(s.zeroHour)).getTime();
    const capMin = s.timeLimitMinutes;
    const after = (t: string) => (parseLocalDateTime(t).getTime() - zero) / 60000;
    expect(capMin).toBeGreaterThan(v(s.end!.lullMin));
    for (const w of [...s.offMap!.fire, ...s.offMap!.attacks].map(x => x.window)) expect(after(w.to)).toBeLessThan(capMin);
    // Spec 12: "several times the historical length".
    expect(capMin).toBeGreaterThanOrEqual(2 * after(v(s.historical.endedAt!)));
  });
  it("enters the 2nd Division's eight tanks (Task 14), each citing Nicholson, in the 2nd Division's barrage sector toward its Blue Line", () => {
    const tanks = vimy().tanks!;
    expect(tanks).toHaveLength(8);
    for (const t of tanks) {
      expect(t.side).toBe('allied');
      expect(t.sectorId).toBe('barrage-2cdn');
      expect(t.objectiveLineId).toBe('blue-2cdn');
      expect(t.cite).toMatchObject({ source: 'nicholson-1962' });
      const sector = vimy().sectors.find((x) => x.id === t.sectorId)!;
      const [, y] = t.start as [number, number];
      expect(y).toBeGreaterThanOrEqual(sector.yMin);
      expect(y).toBeLessThanOrEqual(sector.yMax);
    }
    expect(new Set(tanks.map((t) => t.id)).size).toBe(8);
    const rows = buildReview(vimy()).sections.find(x => x.title === 'Command, flanks and end conditions')!.rows;
    expect(rows.filter(r => r.path.startsWith('tanks')).length).toBe(8);
  });
  it('fires gas on the German battery positions at Zero (Task 14; BOH p. 320), within the counter-battery rounds', () => {
    const gas = vimy().bombardment!.allocations.filter((a) => a.task === 'gas');
    expect(gas.length).toBeGreaterThan(0);
    const cb = vimy().bombardment!.allocations.filter((a) => a.task === 'gas' || a.task === 'battery').reduce((t, a) => t + v(a.rounds), 0);
    // rca-ww1-history's 125,900 counter-battery rounds in the last week: the gas is part of them, not on top.
    expect(cb).toBe(125900);
  });
  it("lists the command section's values in the owner's review", () => {
    const rows = buildReview(vimy()).sections.find(x => x.title === 'Command, flanks and end conditions')!.rows;
    for (const p of ['utcOffsetMin', 'communications.liaison', 'operations', 'offMap.fire', 'offMap.attacks', 'air.observedFrac', 'end.lullMin']) {
      expect(rows.some(r => r.path.startsWith(p)), p).toBe(true);
    }
  });
});
