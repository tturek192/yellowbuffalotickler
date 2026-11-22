import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { ARTILLERY, companyReports, enemySeen, fireMissionEnds, hqPositionOf, messageDueTimes, send } from './comms';
import { churn } from './ground';
import { runPipeline } from './pipeline';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { quietStep } from './schedule';
import { isBusy } from './step';
import type { SimState, StepContext } from './step';
import { fixtureComms, fixtureFire, runStates, vimy, vimyDoctrines, withAlliedFront, withQuietStep } from './test-helpers';
import type { CommsOpts } from './test-helpers';
import type { Order, Report } from './types';

type Run = { states: SimState[]; ctx: StepContext };

/** fixtureComms run by hand for 300 minutes. */
const runReports = (o: CommsOpts = {}): Run => runStates(fixtureComms(o), { endMinute: 300 });

const hq = (s: SimState, id: string) => s.hqs.find((h) => h.formationId === id)!;
/** The first minute c1 shows in `hqId`'s picture as out of `waiting` (the report of its start has reached it). */
const knownMinute = (r: Run, hqId: string): number => r.states.find((s) => hq(s, hqId).picture.units['c1']!.status !== 'waiting')?.minute ?? Infinity;
const arrivalTimes = (r: Run) => ({ battalion: knownMinute(r, 'bn1'), brigade: knownMinute(r, 'b1'), division: knownMinute(r, 'd1'), corps: knownMinute(r, 'cc') });
/** How much later brigade knew c1 had started than it started. */
const pictureLagMin = (r: Run): number => arrivalTimes(r).brigade - r.states.find((s) => s.companies.find((c) => c.id === 'c1')!.status !== 'waiting')!.minute;
const eventsOf = (r: Run) => r.states.flatMap((s) => s.events);

const holdOrder: Order = { kind: 'hold', fromFormationId: 'cc', issuedMin: 0 };
/** The minute an order from corps reaches the companies of bn1 (every allied HQ's leader with this orderSpeed). */
function orderArrival(o: { orderSpeed: number }): number {
  const r = runStates(fixtureComms({ orderSpeed: o.orderSpeed }), {
    endMinute: 400,
    at: (s, ctx) => send(s, ctx, { side: 'allied', kind: 'order', fromFormationId: 'cc', toFormationId: 'bn1', sentMin: 0, payload: holdOrder }),
  });
  return r.states.find((s) => s.companies.find((c) => c.id === 'c1')!.orders.length > 0)?.minute ?? Infinity;
}

describe('communications', () => {
  it('reports reach corps later than brigade, and buried cable beats runners', () => {
    const t = arrivalTimes(runReports({ links: 'runners' })), c = arrivalTimes(runReports({ links: 'buried-cable' }));
    expect(t.corps).toBeGreaterThan(t.brigade); expect(c.corps).toBeLessThan(t.corps);
  });
  it('a slow leader (orderSpeed 1) gets orders to the front later than a fast one (5)', () => {
    expect(orderArrival({ orderSpeed: 1 })).toBeGreaterThan(orderArrival({ orderSpeed: 5 }));
  });
  it('lost messages are logged with lost-contact and retried', () => {
    const ev = eventsOf(runReports({ links: 'runners', failPerHour: 5 }));
    expect(ev.some(e => e.kind === 'message-lost' && e.causes.includes('lost-contact'))).toBe(true);
  });
  it("an HQ's picture lags reality by the channel delay", () => {
    expect(pictureLagMin(runReports({ links: 'runners' }))).toBeGreaterThan(0);
  });

  // Guards beside the brief's four tests.
  it('passes reports up level by level: battalion, then brigade, division and corps', () => {
    const t = arrivalTimes(runReports({ links: 'runners' }));
    expect(t.battalion).toBeLessThan(t.brigade);
    expect(t.brigade).toBeLessThan(t.division);
    expect(t.division).toBeLessThan(t.corps);
    expect(t.corps).toBeLessThan(Infinity);
  });

  it('a lost message is sent again and still arrives; its message-lost refers back to the event it was about', () => {
    // Runners lost at 3 an hour: the report gets through to corps in the end (the run long enough for the draws to allow it).
    const r = runStates(fixtureComms({ links: 'runners', failPerHour: 3 }), { endMinute: 900 });
    const lost = eventsOf(r).filter((e) => e.kind === 'message-lost');
    expect(lost.length).toBeGreaterThan(0);
    for (const e of lost) for (const ref of e.refs) expect(ref).toBeLessThan(e.id);
    expect(lost.some((e) => e.refs.length > 0)).toBe(true);
    expect(arrivalTimes(r).corps).toBeLessThan(Infinity);
    // Each lost message is sent again on the same hop, with the same payload, leaving at the minute it was due.
    const all = r.states.flatMap((s) => s.messages).filter((m, i, xs) => xs.findIndex((x) => x.id === m.id) === i);
    const lostMsgs = all.filter((m) => m.lost && m.dueMin <= r.states.at(-1)!.minute);
    expect(lostMsgs.length).toBeGreaterThan(0);
    for (const m of lostMsgs) {
      const again = all.find((x) => x.id > m.id && x.sentMin === m.dueMin && x.fromFormationId === m.fromFormationId && x.toFormationId === m.toFormationId);
      expect(again, `resend of message ${m.id}`).toBeDefined();
      expect(again!.payload).toEqual(m.payload);
      expect(again!.kind).toBe(m.kind);
    }
  });

  it('without communications every link is a runner, and the defaults say so', () => {
    const r = runReports({ links: 'none' });
    expect([...r.ctx.defaultsUsed]).toContain('communications ← none: every link between headquarters is by runner');
    expect(arrivalTimes(r).corps).toBeLessThan(Infinity);
    expect(r.states.flatMap((s) => s.messages).every((m) => m.channel === 'runner')).toBe(true);
  });

  it('a company reports to its battalion by runner, a default the record lists (the links have no company level)', () => {
    const r = runReports({ links: 'buried-cable' });
    expect([...r.ctx.defaultsUsed]).toContain('communications.links: allied company → battalion ← runner (the links have no company level)');
    const first = r.states.flatMap((s) => s.messages).find((m) => m.fromFormationId === 'c1')!;
    expect(first).toMatchObject({ toFormationId: 'bn1', channel: 'runner', kind: 'report' });
  });

  it('a link that skips a level is used where the level between has none; the levels skipped hear nothing', () => {
    const f = fixtureComms({ links: 'runners' });
    f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'corps', channels: ['contact-patrol'] }] };
    const r = runStates(f, { endMinute: 300 });
    const t = arrivalTimes(r);
    expect(t.corps).toBeLessThan(Infinity);
    expect(t.brigade).toBe(Infinity);
    const toCorps = r.states.flatMap((s) => s.messages).find((m) => m.fromFormationId === 'bn1')!;
    expect(toCorps).toMatchObject({ toFormationId: 'cc', channel: 'contact-patrol' });
  });

  it('a surface line is cut where its end was shelled: the report goes by runner instead', () => {
    const first = (shell: boolean) => {
      const f = withAlliedFront(fixtureComms({ links: 'runners' }), -100);
      f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['surface-line', 'runner'] }] };
      f[0].forces[0]!.formations[0]!.children![0]!.children![0]!.children![0]!.hqPosition = [0, 200];
      const r = runStates(f, {
        endMinute: 120,
        at: (s, ctx) => {
          if (shell) churn(ctx.world, [0, 200], 5);
          return s;
        },
      });
      return r.states.flatMap((s) => s.messages).find((m) => m.fromFormationId === 'bn1')!.channel;
    };
    expect(first(false)).toBe('surface-line');
    expect(first(true)).toBe('runner');
  });

  it('a surface line that lost a message to a failure draw stays cut, both ways, and later messages take the next channel', () => {
    const f = fixtureComms({ links: 'runners' });
    f[0].communications = {
      links: [
        { side: 'allied', from: 'battalion', to: 'brigade', channels: ['surface-line', 'runner'] },
        { side: 'allied', from: 'brigade', to: 'battalion', channels: ['surface-line', 'runner'] },
      ],
    };
    f[1].tables.channels['surface-line'] = { ...f[1].tables.channels['surface-line'], failPerHour: { value: 50, estimate: 'test', description: 'test' } };
    const r = runStates(f, { endMinute: 300 });
    const last = r.states.at(-1)!;
    expect(last.cutLines).toContainEqual(expect.objectContaining({ pair: 'b1|bn1', by: 'failure' }));
    const lostAt = r.states.flatMap((s) => s.messages).find((m) => m.lost && m.channel === 'surface-line')!.dueMin;
    // Every message bn1 sends from the minute the loss was known.
    const after = r.states.flatMap((s) => s.messages).filter((m, i, xs) => xs.findIndex((x) => x.id === m.id) === i && m.fromFormationId === 'bn1' && m.sentMin >= lostAt);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((m) => m.channel === 'runner')).toBe(true);
    expect(after.every((m) => m.factors?.cutBy === 'failure')).toBe(true);
    // The same wire is cut for an order going down it.
    const down = send(last, r.ctx, { side: 'allied', kind: 'order', fromFormationId: 'b1', toFormationId: 'bn1', sentMin: last.minute, payload: holdOrder });
    expect(down.messages.find((m) => m.kind === 'order')).toMatchObject({ channel: 'runner', factors: { cutBy: 'failure' } });
  });

  it('a surface line is cut where shelling churned a cell along its middle, its ends untouched; the cut is noted once', () => {
    const first = (shell: boolean) => {
      const f = fixtureComms({ links: 'runners' });
      f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['surface-line', 'runner'] }] };
      const bde = f[0].forces[0]!.formations[0]!.children![0]!.children![0]!;
      bde.hqPosition = [200, 200];
      bde.children![0]!.hqPosition = [1000, 200];
      const r = runStates(f, {
        endMinute: 120,
        at: (s, ctx) => {
          if (shell) churn(ctx.world, [600, 200], 5);
          return s;
        },
      });
      return { m: r.states.flatMap((s) => s.messages).find((m) => m.fromFormationId === 'bn1')!, cut: r.states.at(-1)!.cutLines };
    };
    expect(first(false).m.channel).toBe('surface-line');
    const shelled = first(true);
    expect(shelled.m).toMatchObject({ channel: 'runner', factors: { cutBy: 'shelling' } });
    expect(shelled.cut.filter((x) => x.pair === 'b1|bn1')).toEqual([expect.objectContaining({ by: 'shelling' })]);
  });

  it('a line found clear is walked again once the churn changes', () => {
    const f = fixtureComms({ links: 'runners' });
    f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['surface-line', 'runner'] }] };
    const bde = f[0].forces[0]!.formations[0]!.children![0]!.children![0]!;
    bde.hqPosition = [200, 200];
    bde.children![0]!.hqPosition = [1000, 200];
    const { state, ctx } = initRun(...f, { seed: 1 });
    const report: Report = { atMin: 0, units: { c1: { status: 'pinned', men: 100, atMin: 0 } }, segments: {}, lines: {} };
    const out = (s: SimState) => send(s, ctx, { side: 'allied', kind: 'report', fromFormationId: 'bn1', toFormationId: 'b1', sentMin: 0, payload: report }).messages.at(-1)!;
    expect(out(state).channel).toBe('surface-line');
    churn(ctx.world, [600, 200], 1);
    expect(out(state).channel).toBe('runner');
  });

  it("a company whose men change keeps its HQ's picture current by a routine report every reportEveryMin, and only then", () => {
    const f = fixtureComms({ links: 'runners' });
    for (const c of allCompanies(f[0].forces[0]!)) c.role = 'reserve';
    // c1 loses 20 men at Zero, its status unchanged.
    const r = runStates(f, { endMinute: 200, at: (s) => ({ ...s, companies: s.companies.map((c) => (c.id === 'c1' ? { ...c, men: c.men - 20, killed: c.killed + 20 } : c)) }) });
    const fromC1 = r.states.flatMap((s) => s.messages).filter((m, i, xs) => m.fromFormationId === 'c1' && xs.findIndex((x) => x.id === m.id) === i);
    expect(fromC1.map((m) => m.sentMin)).toEqual([30]);
    const men = r.states[0]!.companies.find((c) => c.id === 'c1')!.men;
    expect(hq(r.states.at(-1)!, 'bn1').picture.units['c1']).toMatchObject({ status: 'holding', men, atMin: 30 });
    expect(hq(r.states.at(-1)!, 'cc').picture.units['c1']!.men).toBe(men);
  });

  it('a runner takes longer the farther he has to go, beyond the way his delayMin allows for (runnerDelayCoversKm)', () => {
    const delay = (perKm: number, coversKm: number) => {
      const f = fixtureComms({ links: 'runners', effects: { runnerMinPerKm: perKm, runnerDelayCoversKm: coversKm } });
      // c1 starts 6 km back, so its battalion's headquarters (600 m behind the middle of its companies, at x -3,600)
      // is 2.4 km from it.
      f[0].forces[0]!.formations[0]!.children![0]!.children![0]!.children![0]!.companies![0]!.start = [-6000, 100];
      const r = runStates(f, { endMinute: 60 });
      const m = r.states.flatMap((s) => s.messages).find((x) => x.fromFormationId === 'c1')!;
      return m.dueMin - m.sentMin;
    };
    expect(delay(15, 0)).toBeGreaterThan(delay(15, 1.5));
    expect(delay(15, 1.5)).toBeGreaterThan(delay(0, 0));
    // A way no longer than what delayMin allows for adds nothing.
    expect(delay(15, 3)).toBe(delay(0, 0));
  });

  it('a headquarters with no hqPosition stands behind its companies by its level\'s rear offset; one given stands there', () => {
    const f = fixtureComms();
    const { ctx } = initRun(...f, { seed: 1 });
    // bn1's companies start at (0, 100) and (0, 300): allied headquarters stand back toward -x.
    expect(hqPositionOf(ctx, 'bn1')).toEqual([-600, 200]);
    expect(hqPositionOf(ctx, 'b1')).toEqual([-2000, 200]);
    expect(hqPositionOf(ctx, 'd1')).toEqual([-6000, 200]);
    expect(hqPositionOf(ctx, 'cc')).toEqual([-12000, 200]);
    // The German regiment's garrisons hold x 150: its headquarters stands back toward +x.
    expect(hqPositionOf(ctx, 'rir262')).toEqual([2150, 200]);
    expect([...ctx.defaultsUsed]).toContain('formations[bn1].hqPosition ← behind its companies by effects.hqRearOffsetBattalionM');
    expect([...ctx.defaultsUsed]).toContain('formations[rir262].hqPosition ← behind its companies by effects.hqRearOffsetBrigadeM');
    const g = fixtureComms();
    g[0].forces[0]!.formations[0]!.hqPosition = [-9000, 0];
    expect(hqPositionOf(initRun(...g, { seed: 1 }).ctx, 'cc')).toEqual([-9000, 0]);
  });

  it('a default headquarters position is held inside the frame extent', () => {
    const f = fixtureComms();
    f[0].frame = { origin: { lon: 2.7, lat: 50.4 }, bearingDeg: est(75), extent: { minX: -3000, maxX: 3000, minY: -500, maxY: 500 } };
    const { ctx } = initRun(...f, { seed: 1 });
    expect(hqPositionOf(ctx, 'd1')).toEqual([-3000, 200]);
    expect(hqPositionOf(ctx, 'b1')).toEqual([-2000, 200]);
    expect([...ctx.defaultsUsed]).toContain('formations[d1].hqPosition ← behind its companies by effects.hqRearOffsetDivisionM, held inside the frame extent');
  });

  it('at Vimy no German division, group or army headquarters stands in a cell shelled before Zero', () => {
    // At its companies' centroid Gruppe Vimy's stood in a shelled cell, which cut its surface lines from Zero.
    const { ctx } = initRun(vimy(), vimyDoctrines(), { seed: 1 });
    const divisions = ctx.scenario.forces.filter((f) => f.side === 'central').flatMap((f) => allFormationsOf(f)).filter((f) => f.kind === 'division' || f.kind === 'group' || f.kind === 'army');
    const placed = divisions.flatMap((d) => {
      const p = hqPositionOf(ctx, d.id);
      return p ? [{ id: d.id, p }] : [];
    });
    expect(placed.map((x) => x.id)).toEqual(expect.arrayContaining(['79rd', '1brd', '16bd', 'gruppe-vimy', 'sixth-army']));
    const w = ctx.world;
    for (const { id, p } of placed) {
      const cx = Math.floor((p[0] - w.originX) / 50);
      const cy = Math.floor((p[1] - w.originY) / 50);
      const inGrid = cx >= 0 && cy >= 0 && cx < w.cols && cy < w.rows;
      expect(inGrid ? w.churn[cy * w.cols + cx] : 0, id).toBe(0);
    }
  });

  it('is deterministic: the same seed sends the same messages', () => {
    const a = runReports({ links: 'runners', failPerHour: 2 });
    const b = runReports({ links: 'runners', failPerHour: 2 });
    expect(JSON.stringify(a.states.map((s) => s.messages))).toBe(JSON.stringify(b.states.map((s) => s.messages)));
  });
});

describe('communications and quiet steps', () => {
  it('registers message due times; only an order reaching its formation starts movement', () => {
    const { state, ctx } = initRun(...fixtureComms(), { seed: 1 });
    const report: Report = { atMin: 0, units: { c1: { status: 'pinned', men: 100, atMin: 0 } }, segments: {}, lines: {} };
    let s = send(state, ctx, { side: 'allied', kind: 'report', fromFormationId: 'bn1', toFormationId: 'b1', sentMin: 0, payload: report });
    s = send(s, ctx, { side: 'allied', kind: 'order', fromFormationId: 'b1', toFormationId: 'bn1', sentMin: 0, payload: holdOrder });
    const due = messageDueTimes(s, ctx);
    expect(due).toHaveLength(2);
    const byKind = Object.fromEntries(s.messages.map((m, i) => [m.kind, due[i]!]));
    expect(byKind['report']).toEqual({ minute: s.messages.find((m) => m.kind === 'report')!.dueMin, startsMovement: false });
    expect(byKind['order']!.startsMovement).toBe(true);
  });

  it('delivery is not late by a quiet step: a report reaches its HQ at the same minute however the battle is stepped', () => {
    // Nobody moves (every company holds), so the run steps quietly; a report from bn1 to b1 is on its way from minute 0.
    const known = (quietMin: number): { minute: number; dueMin: number } => {
      const f = fixtureComms({ links: 'runners' });
      for (const force of f[0].forces) for (const c of allCompanies(force)) c.role = c.role === 'garrison' ? 'garrison' : 'reserve';
      const m: Models = withQuietStep(f[1], quietMin);
      const { state, ctx } = initRun(f[0], m, { seed: 3 });
      const report: Report = { atMin: 0, units: { c1: { status: 'pinned', men: 100, atMin: 0 } }, segments: {}, lines: {} };
      let s = send(state, ctx, { side: 'allied', kind: 'report', fromFormationId: 'bn1', toFormationId: 'b1', sentMin: 0, payload: report });
      const dueMin = s.messages[0]!.dueMin;
      while (s.minute < 200) {
        const dt = isBusy(s, ctx) ? 2 : quietStep(s, ctx, 2, quietMin);
        s = runPipeline(s, ctx, dt);
        if (hq(s, 'b1').picture.units['c1']!.status === 'pinned') return { minute: s.minute, dueMin };
      }
      return { minute: Infinity, dueMin };
    };
    const coarse = known(10);
    const fine = known(2);
    expect(coarse).toEqual(fine);
    // At the first fine-step minute at or after it was due.
    expect(coarse.minute).toBe(Math.ceil(coarse.dueMin / 2) * 2);
    expect(coarse.minute % 10).not.toBe(0);
  });

  it('fire on call is not late by a quiet step: a call answered in a quiet stretch fires the same, with liaison and without', () => {
    for (const liaison of [false, true]) {
      const run = (quietMin: number) => {
        const f = callFixture({ liaison });
        const m: Models = withQuietStep(f[1], quietMin);
        const { state, ctx } = initRun(f[0], m, { seed: 1 });
        let s = pinnedCalls(state, ctx);
        const events = [...s.events];
        let steps = 0;
        let fired = false;
        while (s.minute < 300) {
          const dt = isBusy(s, ctx) ? 2 : quietStep(s, ctx, 2, quietMin);
          s = runPipeline(s, ctx, Math.min(dt, 300 - s.minute));
          steps++;
          events.push(...s.events);
          if (s.fireMissions.length) {
            fired = true;
            expect(fireMissionEnds(s).every((x) => x.startsMovement === false)).toBe(true);
            expect(fireMissionEnds(s).map((x) => x.minute)).toEqual(s.fireMissions.map((x) => x.toMin));
          }
        }
        const near = (_k: string, x: unknown) => (typeof x === 'number' ? Math.round(x * 1e9) / 1e9 : x);
        return { events: JSON.stringify(events), companies: JSON.stringify(s.companies, near), batteries: JSON.stringify(s.batteries), steps, fired };
      };
      const coarse = run(10);
      const fine = run(2);
      expect(coarse.fired).toBe(true);
      expect(coarse.events).toContain('Fire called for by A Company');
      expect(coarse.steps).toBeLessThan(fine.steps);
      expect(coarse.events).toBe(fine.events);
      // Company states alike to 1e-9: fatigue recovering by many small steps or a few large ones sums in another order.
      expect(coarse.companies).toBe(fine.companies);
      expect(coarse.batteries).toBe(fine.batteries);
    }
  });

  it('quiet steps do not change what happens with messages being lost and sent again', () => {
    const f = fixtureComms({ links: 'runners', failPerHour: 2 });
    const coarse = runScenario(f[0], withQuietStep(f[1], 10), { seed: 1, endMinute: 300, stopEarly: false });
    const fine = runScenario(f[0], withQuietStep(f[1], 2), { seed: 1, endMinute: 300, stopEarly: false });
    expect(coarse.events.filter((e) => e.kind === 'message-lost').length).toBeGreaterThan(0);
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
  });
});

describe('calls for fire', () => {
  const callRun = (o: { liaison: boolean }): Run => runStates(callFixture(o), { endMinute: 300, at: pinnedCalls });
  const answeredAt = (r: Run): number => r.states.find((s) => s.fireMissions.length > 0)?.fireMissions[0]!.fromMin ?? Infinity;

  it('a pinned company calls for fire on the nearest segment the enemy holds', () => {
    const r = callRun({ liaison: false });
    const call = r.states[0]!.messages.find((m) => m.kind === 'call-for-fire')!;
    expect(call).toMatchObject({ fromFormationId: 'c1', toFormationId: 'bn1', finalId: ARTILLERY });
    expect((call.payload as { segmentId: string }).segmentId).toBe(r.states[0]!.segments.find((x) => x.garrisonIds.includes('k1'))!.id);
  });

  it('goes by buried cable from a formation the liaison covers, which answers sooner than the whole chain', () => {
    const chain = callRun({ liaison: false });
    const ll = callRun({ liaison: true });
    expect(answeredAt(ll)).toBeLessThan(answeredAt(chain));
    expect(ll.states.flatMap((s) => s.messages).some((m) => m.toFormationId === ARTILLERY && m.channel === 'buried-cable')).toBe(true);
    // Without liaison the call goes up the chain to the corps, where the artillery is commanded.
    expect(chain.states.flatMap((s) => s.messages).some((m) => m.kind === 'call-for-fire' && m.toFormationId === 'cc')).toBe(true);
  });

  it('the nearest batteries answer with callForFireGuns guns, on the segment, for callForFireMin minutes', () => {
    const r = callRun({ liaison: true });
    const mission = r.states.find((s) => s.fireMissions.length > 0)!.fireMissions[0]!;
    expect(mission.guns).toEqual([{ batteryId: 'near', guns: 4 }, { batteryId: 'far', guns: 2 }]);
    expect(mission.toMin - mission.fromMin).toBe(10);
    const shelled = eventsOf(r).filter((e) => e.kind === 'shelled' && e.text.startsWith('Fire called for by A Company'));
    expect(shelled.length).toBeGreaterThan(0);
    expect(shelled.every((e) => e.minute > mission.fromMin && e.minute < mission.toMin + 2)).toBe(true);
    // Each gun fires rpm (4) × 10 minutes, and nothing else (counter-battery fires nothing of its own in the battle).
    const end = r.states.at(-1)!.batteries;
    expect(end.find((b) => b.id === 'near')!.ammoLeft).toBeCloseTo(1000 - 4 * 4 * 10, 6);
    expect(end.find((b) => b.id === 'far')!.ammoLeft).toBeCloseTo(1000 - 2 * 4 * 10, 6);
    expect(r.states.at(-1)!.fireMissions).toEqual([]);
  });
});

/**
 * fixtureComms with two allied batteries that fire nothing of their own in the battle (counter-battery): `near` (4
 * 18-pdrs, 1,000 rounds) 700 m behind the German trench and `far` (10, 1,000 rounds) 2 km further back; the call goes by
 * the chain or, with `liaison`, from bn1 by buried cable. The allied companies hold (nobody attacks), so the German
 * garrisons are still in their trench when the fire comes.
 */
function callFixture(o: { liaison: boolean }): [Scenario, Models] {
  const f = fixtureComms({ links: 'runners' });
  for (const c of allCompanies(f[0].forces[0]!)) c.role = 'reserve';
  f[0].artillery.push(
    { id: 'near', side: 'allied', weapon: '18pdr', count: est(4), role: 'counter-battery', position: [-550, 200], horseDrawn: false, ammunition: est(1000) },
    { id: 'far', side: 'allied', weapon: '18pdr', count: est(10), role: 'counter-battery', position: [-2550, 200], horseDrawn: false, ammunition: est(1000) },
  );
  if (o.liaison) f[0].communications!.liaison = [{ side: 'allied', formationId: 'bn1', note: { value: 'liaison', estimate: 'test' } }];
  return f;
}

/** c1 pinned for one log phase at Zero (it calls for fire), then holding again as before. */
const pinnedCalls = (s: SimState, ctx: StepContext): SimState => ({
  ...companyReports({ ...s, companies: s.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'pinned' as const } : c)) }, ctx),
  companies: s.companies,
});

type Force = Scenario['forces'][number];
type F = Force['formations'][number];
function allCompanies(force: Force): NonNullable<F['companies']> {
  const out: NonNullable<F['companies']> = [];
  const walk = (f: F): void => {
    out.push(...(f.companies ?? []));
    (f.children ?? []).forEach(walk);
  };
  force.formations.forEach(walk);
  return out;
}

function allFormationsOf(force: Force): F[] {
  const out: F[] = [];
  const walk = (f: F): void => {
    out.push(f);
    (f.children ?? []).forEach(walk);
  };
  force.formations.forEach(walk);
  return out;
}

describe('what a company sees of the enemy (final review fix)', () => {
  /** What c1 (x -400) reports seeing of the garrisons' trench ger-front-a (x 150, 550 m off), at Zero. */
  const seenBy = (f: [Scenario, Models]): string[] => {
    const { state, ctx } = initRun(...f, { seed: 1 });
    const c1 = state.companies.find((c) => c.id === 'c1')!;
    return Object.keys(enemySeen(state, ctx)(c1)).filter((k) => k.startsWith('ger-front-a'));
  };

  it('sees the trench in daylight, in clear weather and with nothing between', () => {
    expect(seenBy(fixtureFire()).length).toBe(2);
  });

  it('sees nothing over a ridge between it and the trench (the line of sight fire uses)', () => {
    expect(seenBy(fixtureFire({ ridgeBetween: true }))).toEqual([]);
  });

  it('sees nothing beyond the visibility: in mist (the weather) and at night (nightVisibilityM)', () => {
    const mist = fixtureFire();
    mist[0].weather = [{ at: '1916-07-01T00:00', precipitation: est('none'), visibilityM: est(300) }];
    expect(seenBy(mist)).toEqual([]);
    const night = fixtureFire();
    night[0].zeroHour = est('1916-07-01T01:00');
    expect(seenBy(night)).toEqual([]);
  });

  it('a pinned company calls for fire only on a segment it can see', () => {
    const calls = (f: [Scenario, Models]) => {
      const { state, ctx } = initRun(...f, { seed: 1 });
      const s: SimState = { ...state, minute: 2, events: [], companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'pinned' as const } : c)) };
      return companyReports(s, ctx).messages.filter((m) => m.kind === 'call-for-fire');
    };
    expect(calls(fixtureFire()).length).toBe(1);
    expect(calls(fixtureFire({ ridgeBetween: true }))).toEqual([]);
  });
});

describe('what a company reports of enemy lines taken or lost (Plan 4 Task 0)', () => {
  const OBSERVER = 'k1';
  const LINE_KEY = 'black|s1';
  type LineOpts = { ridgeBetween?: boolean; hiddenAtOwnY?: boolean; visibilityM?: number; zeroHour?: string };
  /**
   * fixtureFire with the Black Line (x 1150, y 0 to 400, the allies' objective) taken: the observer k1 (German, x 150,
   * y 100) is 1,000 m from it, within observerRangeM. `ridgeBetween`: a ridge across the whole front at x 650, between
   * them; `hiddenAtOwnY`: the ridge only up to y 200, so the trace at k1's y is hidden but the line's north end is not.
   */
  const lineTakenFixture = (o: LineOpts = {}): [Scenario, Models] => {
    const f = fixtureFire(o.ridgeBetween ? { ridge: { x: 650 } } : o.hiddenAtOwnY ? { ridge: { x: 650, yMax: 200 } } : {});
    if (o.visibilityM !== undefined) f[0].weather = [{ at: '1916-07-01T00:00', precipitation: est('none'), visibilityM: est(o.visibilityM) }];
    if (o.zeroHour !== undefined) f[0].zeroHour = est(o.zeroHour);
    return f;
  };
  /** The enemy lines an observer of the side that did not take it names in its report, the step a line is taken within 1.5 km of it. */
  const linesReported = (f: [Scenario, Models], observerId: string): string[] => {
    const { state, ctx } = initRun(...f, { seed: 1 });
    const taken = { id: state.nextEventId, minute: 2, kind: 'line-taken', sectorId: 's1', lineId: 'black', text: 'Black Line taken', causes: ['followed-barrage'], refs: [] } as SimState['events'][number];
    const s: SimState = { ...state, minute: 2, events: [taken], nextEventId: state.nextEventId + 1 };
    const out = companyReports(s, ctx);
    return out.messages
      .filter((m) => m.kind === 'report' && m.fromFormationId === observerId)
      .flatMap((m) => Object.keys((m.payload as Report).lines));
  };

  it('reports a line taken within observerRangeM that it can see, in daylight and clear weather', () => {
    expect(linesReported(lineTakenFixture(), OBSERVER)).toEqual([LINE_KEY]);
  });
  it('does not report a line taken within 1.5 km with no line of sight to any point of it in the sector', () => {
    expect(linesReported(lineTakenFixture({ ridgeBetween: true }), OBSERVER)).toEqual([]);
  });
  it('does not report it in mist (the weather)', () => {
    expect(linesReported(lineTakenFixture({ visibilityM: 300 }), OBSERVER)).toEqual([]);
  });
  it('does not report it at night (nightVisibilityM)', () => {
    expect(linesReported(lineTakenFixture({ zeroHour: '1916-07-01T01:00' }), OBSERVER)).toEqual([]);
  });
  it('sees the line at some point in the sector even where the trace at its own y is hidden', () => {
    expect(linesReported(lineTakenFixture({ hiddenAtOwnY: true }), OBSERVER)).toEqual([LINE_KEY]);
  });
});
