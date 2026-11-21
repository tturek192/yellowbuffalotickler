import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { ARTILLERY, companyReports, messageDueTimes, send } from './comms';
import { churn } from './ground';
import { runPipeline } from './pipeline';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { quietStep } from './schedule';
import { isBusy } from './step';
import type { SimState, StepContext } from './step';
import { fixtureComms, runStates, withAlliedFront, withQuietStep } from './test-helpers';
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
    const r = runReports({ links: 'runners', failPerHour: 3 });
    const lost = eventsOf(r).filter((e) => e.kind === 'message-lost');
    expect(lost.length).toBeGreaterThan(0);
    for (const e of lost) for (const ref of e.refs) expect(ref).toBeLessThan(e.id);
    expect(lost.some((e) => e.refs.length > 0)).toBe(true);
    expect(arrivalTimes(r).corps).toBeLessThan(Infinity);
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
      const r = runStates(f, {
        endMinute: 120,
        at: (s, ctx) => {
          // bn1 stands at the middle of its companies' places, (0, 200).
          if (shell) churn(ctx.world, [0, 200], 5);
          return s;
        },
      });
      return r.states.flatMap((s) => s.messages).find((m) => m.fromFormationId === 'bn1')!.channel;
    };
    expect(first(false)).toBe('surface-line');
    expect(first(true)).toBe('runner');
  });

  it('a surface line that lost a message to a failure draw stays cut, and later messages take the next channel', () => {
    const f = fixtureComms({ links: 'runners' });
    f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['surface-line', 'runner'] }] };
    f[1].tables.channels['surface-line'] = { ...f[1].tables.channels['surface-line'], failPerHour: { value: 50, estimate: 'test', description: 'test' } };
    const r = runStates(f, { endMinute: 300 });
    const last = r.states.at(-1)!;
    expect(last.cutLines).toContain('bn1>b1');
    const lostAt = eventsOf(r).find((e) => e.kind === 'message-lost')!.minute;
    const after = r.states.filter((s) => s.minute > lostAt).flatMap((s) => s.messages).filter((m) => m.fromFormationId === 'bn1');
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((m) => m.channel === 'runner')).toBe(true);
  });

  it('a runner takes longer the farther he has to go (runnerMinPerKm)', () => {
    const delay = (perKm: number) => {
      const f = fixtureComms({ links: 'runners', effects: { runnerMinPerKm: perKm } });
      // c1 starts 2 km from its battalion's headquarters (the middle of its companies' places).
      f[0].forces[0]!.formations[0]!.children![0]!.children![0]!.children![0]!.companies![0]!.start = [-4000, 100];
      const r = runStates(f, { endMinute: 60 });
      const m = r.states.flatMap((s) => s.messages).find((x) => x.fromFormationId === 'c1')!;
      return m.dueMin - m.sentMin;
    };
    expect(delay(15)).toBeGreaterThan(delay(0) + 15);
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

  it('quiet steps do not change what happens with messages being lost and sent again', () => {
    const f = fixtureComms({ links: 'runners', failPerHour: 2 });
    const coarse = runScenario(f[0], withQuietStep(f[1], 10), { seed: 1, endMinute: 300, stopEarly: false });
    const fine = runScenario(f[0], withQuietStep(f[1], 2), { seed: 1, endMinute: 300, stopEarly: false });
    expect(coarse.events.filter((e) => e.kind === 'message-lost').length).toBeGreaterThan(0);
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
  });
});

describe('calls for fire', () => {
  /**
   * fixtureComms with two allied batteries that fire nothing of their own in the battle (counter-battery): `near` (4
   * 18-pdrs, 1,000 rounds) 700 m behind the German trench and `far` (10, 1,000 rounds) 2 km further back; c1 pinned
   * at minute 0 calls for fire, the call going by the chain or, with `liaison`, from bn1 by buried cable. The allied
   * companies hold (nobody attacks), so the German garrisons are still in their trench when the fire comes.
   */
  function callRun(o: { liaison: boolean }): Run {
    const f = fixtureComms({ links: 'runners' });
    for (const c of allCompanies(f[0].forces[0]!)) c.role = 'reserve';
    f[0].artillery.push(
      { id: 'near', side: 'allied', weapon: '18pdr', count: est(4), role: 'counter-battery', position: [-550, 200], horseDrawn: false, ammunition: est(1000) },
      { id: 'far', side: 'allied', weapon: '18pdr', count: est(10), role: 'counter-battery', position: [-2550, 200], horseDrawn: false, ammunition: est(1000) },
    );
    if (o.liaison) f[0].communications!.liaison = [{ side: 'allied', formationId: 'bn1', note: { value: 'liaison', estimate: 'test' } }];
    return runStates(f, {
      endMinute: 300,
      // c1 is pinned for the log phase only (it calls), then holds again as before.
      at: (s, ctx) => ({ ...companyReports({ ...s, companies: s.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'pinned' as const } : c)) }, ctx), companies: s.companies }),
    });
  }
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
