import { z } from 'zod';
import {
  FormationSchema,
  GROUND_CONDITIONS,
  LeaderSchema,
  SourcesSchema,
  WeatherSchema,
  type Company,
  type Formation,
  type GroundCondition,
  type Leader,
  type Scenario,
  type Sources,
} from './schema';
import { formatIssues, parseYaml, ScenarioError } from './load';
import { checkReferences, collectSourceRefs } from './references';
import { addMinutes, minutesBetween } from './local-time';
import { v } from './sourced';

/*
 * What-if overlays (Plan 4 Task 1): a file of changes to a scenario, and `applyOverlay`, which applies them to give a new
 * scenario. The scenario's own files are never edited. A Sourced or Disputed number an op changes becomes
 * `{ value, estimate: 'what-if: <title> — <op>' }`, its old value kept in the Change; a plain field (a doctrine id, a
 * leader id, a company's start) changes in place and is recorded only in the changes; a library item keeps its own sourcing.
 * Node-free, like load.ts: the browser parses overlays too.
 */

type Side = 'allied' | 'central';
const SideSchema = z.enum(['allied', 'central']);
const Local = z.tuple([z.number(), z.number()]);

type WeatherEntry = Scenario['weather'][number];
/** A weather timeline relative to Zero: each entry `afterMin` minutes after the scenario's zeroHour (negative: before). */
export type WeatherPreset = Array<Omit<WeatherEntry, 'at'> & { afterMin: number }>;
const WeatherPresetSchema = z.array(WeatherSchema.omit({ at: true }).extend({ afterMin: z.number() }));

export type OverlayOp =
  | { op: 'scale-men'; side?: Side; formationId?: string; factor: number }
  | { op: 'scale-guns'; side?: Side; artilleryId?: string; factor: number }
  | { op: 'scale-ammunition'; side?: Side; artilleryId?: string; factor: number }
  | { op: 'remove-formation'; formationId: string }
  | {
      op: 'add-formation';
      from: { libraryId: string } | { formationId: string; copyOf: string };
      side: Side;
      underFormationId: string;
      entryPoint: [number, number];
      distanceKm: number;
    }
  | { op: 'weather'; preset: string }
  | { op: 'weather'; timeline: Scenario['weather'] }
  | { op: 'ground'; preset: GroundCondition }
  | { op: 'swap-leader'; formationId: string; leaderId: string }
  | { op: 'doctrine'; side: Side; doctrineId: string }
  | { op: 'reserve-distance'; formationId?: string; side?: Side; km: number }
  | { op: 'move'; unitId: string; by: [number, number] };

export type Overlay = { id: string; title: string; scenarioId: string; notes?: string; ops: OverlayOp[] };

const OpSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('scale-men'), side: SideSchema.optional(), formationId: z.string().optional(), factor: z.number().positive() }),
  z.strictObject({ op: z.literal('scale-guns'), side: SideSchema.optional(), artilleryId: z.string().optional(), factor: z.number().nonnegative() }),
  z.strictObject({ op: z.literal('scale-ammunition'), side: SideSchema.optional(), artilleryId: z.string().optional(), factor: z.number().nonnegative() }),
  z.strictObject({ op: z.literal('remove-formation'), formationId: z.string() }),
  z.strictObject({
    op: z.literal('add-formation'),
    from: z.union([z.strictObject({ libraryId: z.string() }), z.strictObject({ formationId: z.string(), copyOf: z.string() })]),
    side: SideSchema,
    underFormationId: z.string(),
    entryPoint: Local,
    distanceKm: z.number().nonnegative(),
  }),
  // One weather op, with exactly one of a preset (from the library) or a timeline (checked on the overlay below).
  z.strictObject({ op: z.literal('weather'), preset: z.string().min(1).optional(), timeline: z.array(WeatherSchema).optional() }),
  z.strictObject({ op: z.literal('ground'), preset: z.enum(GROUND_CONDITIONS) }),
  z.strictObject({ op: z.literal('swap-leader'), formationId: z.string(), leaderId: z.string() }),
  z.strictObject({ op: z.literal('doctrine'), side: SideSchema, doctrineId: z.string() }),
  z.strictObject({ op: z.literal('reserve-distance'), formationId: z.string().optional(), side: SideSchema.optional(), km: z.number().nonnegative() }),
  z.strictObject({ op: z.literal('move'), unitId: z.string(), by: Local }),
]);

export const OverlaySchema = z
  .strictObject({ id: z.string().min(1), title: z.string().min(1), scenarioId: z.string().min(1), notes: z.string().optional(), ops: z.array(OpSchema) })
  .superRefine((o, ctx) =>
    o.ops.forEach((op, i) => {
      if (op.op === 'weather' && (op.preset === undefined) === (op.timeline === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['ops', i], message: 'a weather op needs exactly one of preset or timeline' });
      }
    }),
  ) as unknown as z.ZodType<Overlay>;

/** Leaders, formations and weather presets an overlay may draw on, with the sources they cite (Task 2 fills it from files). */
export type Library = { sources: Sources; leaders: Leader[]; formations: Formation[]; weatherPresets: Record<string, WeatherPreset> };
export const LibrarySchema = z.strictObject({
  sources: SourcesSchema,
  leaders: z.array(LeaderSchema),
  formations: z.array(FormationSchema),
  weatherPresets: z.record(z.string(), WeatherPresetSchema),
}) as unknown as z.ZodType<Library>;

export const emptyLibrary = (): Library => ({ sources: {}, leaders: [], formations: [], weatherPresets: {} });

/** Parse and check an overlay file's text; each problem names its path, e.g. `ops[0].factor: …`. */
export function parseOverlay(yamlText: string): Overlay {
  const r = OverlaySchema.safeParse(parseYaml(yamlText));
  if (!r.success) throw new ScenarioError(formatIssues(r.error));
  return r.data;
}

/** One value an overlay changed: the op's index in `ops`, the scenario path, and the value before and after (absent: undefined). */
export type Change = { index: number; path: string; from: unknown; to: unknown };
export type Unresolved = { index: number; op: OverlayOp; reason: string };

type Force = Scenario['forces'][number];
type Placed = { f: Formation; path: string; side: Side; siblings: Formation[] };
const ATTACKING: ReadonlySet<string> = new Set(['assault', 'mopup', 'support']);

/** Every formation with its path, side and the array that holds it, depth-first in file order. */
function placed(s: Scenario): Placed[] {
  const out: Placed[] = [];
  const walk = (fs: Formation[], base: string, side: Side) =>
    fs.forEach((f, i) => {
      const path = `${base}[${i}]`;
      out.push({ f, path, side, siblings: fs });
      if (f.children) walk(f.children, `${path}.children`, side);
    });
  s.forces.forEach((force, i) => walk(force.formations, `forces[${i}].formations`, force.side));
  return out;
}

/** The companies under a formation (itself and its children), with their paths. */
function companiesUnder(f: Formation, path: string): Array<{ c: Company; path: string }> {
  return [
    ...(f.companies ?? []).map((c, j) => ({ c, path: `${path}.companies[${j}]` })),
    ...(f.children ?? []).flatMap((ch, k) => companiesUnder(ch, `${path}.children[${k}]`)),
  ];
}

const leadersUnder = (f: Formation): string[] => [...(f.leaderId ? [f.leaderId] : []), ...(f.children ?? []).flatMap(leadersUnder)];
const idsUnder = (f: Formation): string[] => [f.id, ...(f.children ?? []).flatMap(idsUnder)];
const hasCompanies = (f: Formation): boolean => (f.companies?.length ?? 0) > 0 || (f.children ?? []).some(hasCompanies);
const localText = (d: Date): string => d.toISOString().slice(0, 16);

/** A formation made an off-map reserve: every company a reserve standing at the entry point, no headquarters place of its own. */
function asReserve(f: Formation, at: [number, number], rename: (id: string) => string): Formation {
  const { hqPosition: _hq, children, companies, ...rest } = f;
  return {
    ...rest,
    id: rename(f.id),
    ...(companies
      ? {
          companies: companies.map((c) => {
            const { sectorId: _s, objectiveLineId: _o, startAfterMin: _a, trenchFeatureId: _t, counterAttacks: _c, ...keep } = c;
            return { ...keep, id: rename(c.id), role: 'reserve' as const, start: [at[0], at[1]] as [number, number] };
          }),
        }
      : {}),
    ...(children ? { children: children.map((ch) => asReserve(ch, at, rename)) } : {}),
  };
}

type Applied = { scenario: Scenario; changes: Change[]; unresolved: Unresolved[]; problems: string[] };

/** The ops applied to a copy of `s`: the changes, the ops that did not resolve, and problems an op itself found. */
function applyOps(s0: Scenario, o: Overlay, lib: Library, doctrineIds: string[]): Applied {
  // A deep copy, so nothing of `s0` is changed or shared (the engine caches by scenario object); the terrain grid is never changed.
  const { terrainGrid, ...rest } = s0;
  const s: Scenario = { ...structuredClone(rest), ...(terrainGrid ? { terrainGrid } : {}) };
  const changes: Change[] = [];
  const unresolved: Unresolved[] = [];
  const problems: string[] = [];

  o.ops.forEach((op, index) => {
    const estimate = `what-if: ${o.title} — ${op.op}`;
    /** A Sourced or Disputed value replaced by a what-if estimate; the old one (range and sources too) kept in the change. */
    const mark = <T>(path: string, from: unknown, value: T) => {
      const to = { value, estimate };
      changes.push({ index, path, from, to });
      return to;
    };
    const plain = (path: string, from: unknown, to: unknown) => void changes.push({ index, path, from, to });
    const miss = (reason: string) => void unresolved.push({ index, op, reason });
    const problem = (p: string) => void problems.push(`ops[${index}] (${op.op}): ${p}`);
    /** Bring the sources a library item cites into the scenario's registry, each merge a change. */
    const mergeSources = (item: unknown) => {
      for (const { id } of collectSourceRefs(item, '')) {
        if (Object.hasOwn(s.sources, id) || !Object.hasOwn(lib.sources, id)) continue; // unknown everywhere: checkReferences says so
        s.sources[id] = structuredClone(lib.sources[id]!);
        plain(`sources.${id}`, undefined, s.sources[id]);
      }
    };
    const find = (id: string) => placed(s).find((p) => p.f.id === id);
    const forcesOf = (side?: Side): Array<{ force: Force; i: number }> =>
      s.forces.flatMap((force, i) => (side === undefined || force.side === side ? [{ force, i }] : []));

    switch (op.op) {
      case 'scale-men': {
        let target: Placed | undefined;
        if (op.formationId !== undefined) {
          target = find(op.formationId);
          if (!target) return miss(`formation "${op.formationId}"`);
        }
        const scope = target
          ? [target]
          : forcesOf(op.side).flatMap(({ force, i }) => force.formations.map((f, j) => ({ f, path: `forces[${i}].formations[${j}]`, side: force.side, siblings: force.formations })));
        for (const p of scope) {
          if (op.side !== undefined && p.side !== op.side) continue;
          for (const { c, path } of companiesUnder(p.f, p.path)) {
            c.strength = mark(`${path}.strength`, c.strength, Math.max(1, Math.round(v(c.strength) * op.factor)));
          }
        }
        // Off-map reserves the engine makes companies up for: the factor goes on the reserve, multiplied into any it has.
        const within = new Set(scope.flatMap((p) => idsUnder(p.f)));
        const all = placed(s);
        s.reserves.forEach((r, i) => {
          const f = all.find((p) => p.f.id === r.formationId)?.f;
          if (!f || hasCompanies(f) || !within.has(r.formationId) || (op.side !== undefined && r.side !== op.side)) return;
          r.strengthFactor = mark(`reserves[${i}].strengthFactor`, r.strengthFactor, (r.strengthFactor ? v(r.strengthFactor) : 1) * op.factor);
        });
        return;
      }
      case 'scale-guns':
      case 'scale-ammunition': {
        if (op.artilleryId !== undefined && !s.artillery.some((a) => a.id === op.artilleryId)) return miss(`artillery "${op.artilleryId}"`);
        const chosen = new Set<string>();
        s.artillery.forEach((a, i) => {
          if ((op.artilleryId !== undefined && a.id !== op.artilleryId) || (op.side !== undefined && a.side !== op.side)) return;
          chosen.add(a.id);
          if (op.op === 'scale-guns') a.count = mark(`artillery[${i}].count`, a.count, Math.round(v(a.count) * op.factor));
          else if (a.ammunition) a.ammunition = mark(`artillery[${i}].ammunition`, a.ammunition, Math.round(v(a.ammunition) * op.factor));
        });
        if (op.op === 'scale-ammunition') {
          s.bombardment?.allocations.forEach((al, i) => {
            if (chosen.has(al.artilleryId)) al.rounds = mark(`bombardment.allocations[${i}].rounds`, al.rounds, Math.round(v(al.rounds) * op.factor));
          });
        }
        return;
      }
      case 'remove-formation': {
        const target = find(op.formationId);
        if (!target) return miss(`formation "${op.formationId}"`);
        const ids = new Set(idsUnder(target.f));
        plain(target.path, target.f, undefined);
        target.siblings.splice(target.siblings.indexOf(target.f), 1);
        // What names the formation or one under it goes with it; historical targets stay (the compare screen marks them).
        const keep = <T>(xs: T[], base: string, names: (x: T) => string | undefined): T[] =>
          xs.filter((x, i) => {
            const id = names(x);
            if (id === undefined || !ids.has(id)) return true;
            plain(`${base}[${i}]`, x, undefined);
            return false;
          });
        s.reserves = keep(s.reserves, 'reserves', (r) => r.formationId);
        if (s.operations) s.operations = keep(s.operations, 'operations', (x) => x.formationId);
        if (s.communications?.liaison) s.communications.liaison = keep(s.communications.liaison, 'communications.liaison', (x) => x.formationId);
        s.artillery.forEach((a, i) => {
          if (a.formationId === undefined || !ids.has(a.formationId)) return;
          plain(`artillery[${i}].formationId`, a.formationId, undefined);
          delete a.formationId;
        });
        return;
      }
      case 'add-formation': {
        const under = find(op.underFormationId);
        let made: Formation;
        if ('libraryId' in op.from) {
          const libraryId = op.from.libraryId;
          const item = lib.formations.find((f) => f.id === libraryId);
          if (!item) return miss(`library formation "${libraryId}"`);
          if (!under) return miss(`formation "${op.underFormationId}"`);
          made = asReserve(structuredClone(item), op.entryPoint, (id) => id);
          // The leaders it names that the scenario lacks come from the library, with their own sourcing.
          for (const id of [...new Set(leadersUnder(made))].sort()) {
            const leader = lib.leaders.find((l) => l.id === id);
            if (!leader || s.leaders.some((l) => l.id === id)) continue;
            s.leaders.push(structuredClone(leader));
            plain(`leaders[${s.leaders.length - 1}]`, undefined, leader);
            mergeSources(leader);
          }
          mergeSources(item);
        } else {
          const { formationId, copyOf } = op.from;
          const original = find(copyOf);
          if (!original) return miss(`formation "${copyOf}"`);
          if (!under) return miss(`formation "${op.underFormationId}"`);
          made = asReserve(structuredClone(original.f), op.entryPoint, (id) => (id === copyOf ? formationId : `${formationId}-${id}`));
          made.name = `${made.name} (what-if copy)`;
        }
        if (under.side !== op.side) return problem(`formation "${op.underFormationId}" is on the ${under.side} side, not ${op.side}`);
        const children = (under.f.children ??= []);
        children.push(made);
        plain(`${under.path}.children[${children.length - 1}]`, undefined, made);
        const reserve = { formationId: made.id, side: op.side, distanceKm: { value: op.distanceKm, estimate }, entryPoint: op.entryPoint };
        s.reserves.push(reserve);
        plain(`reserves[${s.reserves.length - 1}]`, undefined, reserve);
        return;
      }
      case 'weather': {
        let timeline: Scenario['weather'];
        if ('preset' in op && op.preset !== undefined) {
          const preset = Object.hasOwn(lib.weatherPresets, op.preset) ? lib.weatherPresets[op.preset] : undefined;
          if (!preset) return miss(`weather preset "${op.preset}"`);
          const zero = v(s.zeroHour);
          timeline = preset.map(({ afterMin, ...e }) => ({ at: localText(addMinutes(zero, afterMin)), ...structuredClone(e) }));
          mergeSources(preset);
        } else {
          timeline = structuredClone((op as { timeline: Scenario['weather'] }).timeline);
        }
        plain('weather', s.weather, timeline);
        s.weather = timeline;
        return;
      }
      case 'ground':
        s.groundCondition = mark('groundCondition', s.groundCondition, op.preset);
        return;
      case 'swap-leader': {
        const target = find(op.formationId);
        if (!target) return miss(`formation "${op.formationId}"`);
        if (!s.leaders.some((l) => l.id === op.leaderId)) {
          const leader = lib.leaders.find((l) => l.id === op.leaderId);
          if (!leader) return miss(`leader "${op.leaderId}"`);
          s.leaders.push(structuredClone(leader));
          plain(`leaders[${s.leaders.length - 1}]`, undefined, leader);
          mergeSources(leader);
        }
        plain(`${target.path}.leaderId`, target.f.leaderId, op.leaderId);
        target.f.leaderId = op.leaderId;
        return;
      }
      case 'doctrine': {
        if (!doctrineIds.includes(op.doctrineId)) return miss(`doctrine "${op.doctrineId}"`);
        const forces = forcesOf(op.side);
        if (forces.length === 0) return miss(`side "${op.side}" (the scenario has no force on it)`);
        for (const { force, i } of forces) {
          plain(`forces[${i}].doctrine`, force.doctrine, op.doctrineId);
          force.doctrine = op.doctrineId;
        }
        return;
      }
      case 'reserve-distance': {
        const matches = s.reserves.flatMap((r, i) =>
          (op.formationId === undefined || r.formationId === op.formationId) && (op.side === undefined || r.side === op.side) ? [{ r, i }] : [],
        );
        if (op.formationId !== undefined && matches.length === 0) return miss(`reserve "${op.formationId}"`);
        for (const { r, i } of matches) r.distanceKm = mark(`reserves[${i}].distanceKm`, r.distanceKm, op.km);
        return;
      }
      case 'move': {
        const all = placed(s);
        const company = all.flatMap((p) => (p.f.companies ?? []).map((c, j) => ({ c, path: `${p.path}.companies[${j}]` }))).find((x) => x.c.id === op.unitId);
        let moved: Array<{ c: Company; path: string }>;
        if (company) moved = [company];
        else {
          const bn = all.find((p) => p.f.id === op.unitId);
          if (!bn) return miss(`unit "${op.unitId}"`);
          if (bn.f.kind !== 'battalion') return miss(`unit "${op.unitId}" (a ${bn.f.kind}; move takes a company or a battalion)`);
          moved = companiesUnder(bn.f, bn.path);
        }
        for (const { c, path } of moved) {
          if (!Array.isArray(c.start)) return problem(`${path}.start is not a local point`);
          const to: [number, number] = [c.start[0] + op.by[0], c.start[1] + op.by[1]];
          plain(`${path}.start`, c.start, to);
          c.start = to;
        }
        return;
      }
    }
  });
  return { scenario: s, changes, unresolved, problems };
}

/**
 * What an overlaid scenario must still satisfy before any run: its references check (checkReferences; a historical
 * target may name a formation a what-if removed, and stays), each side with a force keeps at least one company, each
 * sector at least one attacking company, and every weather entry lies inside the battle: from a day before Zero (the
 * day of weather `wetness` reads back) to `zeroHour + timeLimitMinutes`.
 */
export function checkOverlaid(s: Scenario, doctrineIds: string[]): string[] {
  const problems = checkReferences(s, doctrineIds).filter((p) => !/^historical\.(casualties|reserveArrivals)\[\d+\]\.formationId: unknown formation/.test(p));
  const all = placed(s);
  for (const side of ['allied', 'central'] as const) {
    if (!s.forces.some((f) => f.side === side)) continue;
    if (!all.some((p) => p.side === side && (p.f.companies?.length ?? 0) > 0)) problems.push(`forces: the ${side} side has no companies left`);
  }
  const companies = all.flatMap((p) => p.f.companies ?? []);
  s.sectors.forEach((x, i) => {
    if (!companies.some((c) => c.sectorId === x.id && ATTACKING.has(c.role))) problems.push(`sectors[${i}] (${x.id}): no attacking companies left in the sector`);
  });
  const zero = v(s.zeroHour);
  s.weather.forEach((w, i) => {
    const m = minutesBetween(zero, w.at);
    if (m < -MIN_PER_DAY || m > s.timeLimitMinutes) {
      problems.push(`weather[${i}].at: ${w.at} is outside the battle (${localText(addMinutes(zero, -MIN_PER_DAY))} to ${localText(addMinutes(zero, s.timeLimitMinutes))})`);
    }
  });
  return problems;
}
const MIN_PER_DAY = 1440;

/**
 * Apply an overlay to a scenario (pure: `s` is never changed). Returns the new scenario, every change grouped by op
 * index, and the ops that no longer resolve (an unknown formation, unit, leader, artillery, library item, preset or
 * doctrine id: the caller decides; the other ops still apply). Throws ScenarioError if the result fails `checkOverlaid`,
 * each problem naming the op and index that caused it where one can be named.
 */
export function applyOverlay(
  s: Scenario,
  o: Overlay,
  lib: Library,
  doctrineIds: string[],
): { scenario: Scenario; changes: Change[]; unresolved: Unresolved[] } {
  const r = applyOps(s, o, lib, doctrineIds);
  const found = checkOverlaid(r.scenario, doctrineIds);
  if (r.problems.length || found.length) throw new ScenarioError([...r.problems, ...blame(found, s, o, lib, doctrineIds)]);
  return { scenario: r.scenario, changes: r.changes, unresolved: r.unresolved };
}

/**
 * Name the op behind each problem: the first op after which the problem appears (the overlay's ops applied up to it);
 * failing that, the first op after which any new problem appears; failing that, the problem as it is.
 */
function blame(found: string[], s: Scenario, o: Overlay, lib: Library, doctrineIds: string[]): string[] {
  if (found.length === 0) return [];
  const base = new Set(checkOverlaid(s, doctrineIds));
  const after = o.ops.map((_, k) => checkOverlaid(applyOps(s, { ...o, ops: o.ops.slice(0, k + 1) }, lib, doctrineIds).scenario, doctrineIds));
  const firstNew = after.findIndex((ps) => ps.some((p) => !base.has(p)));
  return found.map((p) => {
    const k = after.findIndex((ps) => ps.includes(p));
    const at = k >= 0 ? k : firstNew;
    return at >= 0 ? `ops[${at}] (${o.ops[at]!.op}): ${p}` : p;
  });
}
