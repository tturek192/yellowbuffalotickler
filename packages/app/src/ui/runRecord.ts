import type { CompanyStatus, RunRecord } from '@wwi/engine';
import { FEATURE_KINDS, isLocalDateTime, LOCAL_DATETIME_FORMAT, POSTURES, terrainGridProblem } from '@wwi/scenario';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isPoints = (v: unknown, min: number): boolean => Array.isArray(v) && v.length >= min && v.every(isPoint);

const SIDES: readonly unknown[] = ['allied', 'central'];
const STATUSES: readonly CompanyStatus[] = [
  'waiting', 'advancing', 'consolidating', 'holding', 'pinned', 'falling-back', 'counter-attacking',
  'surrendered', 'destroyed', 'marching', 'off-map',
];
/** The company columns the player reads; a record may carry more. */
const NEEDED_COLUMNS = ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture'] as const;
const isFrac = (v: unknown): boolean => isNum(v) && v >= 0 && v <= 1;
const KINDS: readonly unknown[] = FEATURE_KINDS;

/** A feature needs an id, a known kind, and a Point, LineString or Polygon geometry with usable coordinates. */
function isFeature(f: unknown): boolean {
  if (!isObject(f) || typeof f.id !== 'string' || !KINDS.includes(f.kind)) return false;
  const g = f.geometry;
  if (!isObject(g)) return false;
  if (g.type === 'Point') return isPoint(g.coordinates) && (g.radiusM === undefined || isNum(g.radiusM));
  if (g.type === 'LineString') return isPoints(g.coordinates, 2);
  if (g.type === 'Polygon') return isPoints(g.coordinates, 3);
  return false;
}

/** The segment columns the player reads; a record may carry more. */
const NEEDED_SEGMENT_COLUMNS = ['segment', 'holder', 'wireCut', 'emerged'] as const;
/** The reserve columns the player reads (engine 0.3.7 on); a record may carry more. */
const NEEDED_RESERVE_COLUMNS = ['formationId', 'status', 'orderedMin', 'arriveMin'] as const;
const RESERVE_STATUSES: readonly unknown[] = ['waiting', 'ordered', 'marching', 'arrived'];
/** The tank columns the player reads (engine 0.4.2 on, only in runs with tanks); a record may carry more. */
const NEEDED_TANK_COLUMNS = ['id', 'x', 'y', 'status'] as const;
const TANK_STATUSES: readonly unknown[] = ['moving', 'halted', 'arrived', 'bogged'];
const isMinute = (v: unknown): boolean => v === null || (isNum(v) && v >= 0);

/** A trench segment in the geometry: an id, its feature, its garrisons and a y band. */
const isSegment = (x: unknown): boolean =>
  isObject(x) &&
  typeof x.id === 'string' &&
  typeof x.featureId === 'string' &&
  Array.isArray(x.garrisonIds) &&
  x.garrisonIds.every((id) => typeof id === 'string') &&
  isNum(x.yMin) &&
  isNum(x.yMax) &&
  x.yMin <= x.yMax &&
  isNum(x.lengthM) &&
  x.lengthM >= 0;

const isUnit = (u: unknown): boolean =>
  isObject(u) &&
  typeof u.id === 'string' &&
  typeof u.battalionId === 'string' &&
  typeof u.name === 'string' &&
  SIDES.includes(u.side) &&
  (u.insignia === undefined || typeof u.insignia === 'string');

/** The period style's data (engine 0.4.6 on; each optional): a battery's place, a division and its patch, a contact patrol. */
const isBattery = (b: unknown): boolean => isObject(b) && typeof b.id === 'string' && SIDES.includes(b.side) && typeof b.weapon === 'string' && isNum(b.count) && isPoint(b.at);
const isDivision = (d: unknown): boolean =>
  isObject(d) && typeof d.id === 'string' && typeof d.name === 'string' && SIDES.includes(d.side) && (d.insignia === undefined || typeof d.insignia === 'string');
const isPatrol = (p: unknown): boolean => isObject(p) && typeof p.fromId === 'string' && SIDES.includes(p.side) && isNum(p.sentMin) && isNum(p.dueMin);

/** Check the parts of a run record the player reads; throw a readable message for anything else. */
export function parseRunRecord(data: unknown): RunRecord {
  const fail = (what: string): never => {
    throw new Error(`This file is not a run record: ${what}.`);
  };
  if (!isObject(data)) return fail('expected a JSON object');
  if (typeof data.zeroHour !== 'string' || !isLocalDateTime(data.zeroHour)) fail(`zeroHour must be '${LOCAL_DATETIME_FORMAT}'`);
  if (!isNum(data.endMinute) || data.endMinute < 0) fail('endMinute must be a non-negative number');
  if (typeof data.scenarioTitle !== 'string') fail('scenarioTitle must be a string');
  const g = data.geometry;
  if (!isObject(g) || !Array.isArray(g.lines)) fail('geometry.lines must be an array');
  if (!Array.isArray((g as Record<string, unknown>).sectors)) fail('geometry.sectors must be an array');
  const features = (g as Record<string, unknown>).features;
  if (!Array.isArray(features)) fail('geometry.features must be an array (records from engine 0.2.0 on carry it)');
  (features as unknown[]).forEach((f, i) => {
    if (!isFeature(f)) fail(`geometry.features[${i}] needs an id, a known kind and a Point, LineString or Polygon geometry`);
  });
  const terrain = (g as Record<string, unknown>).terrain;
  if (terrain !== undefined) {
    const problem = terrainGridProblem(terrain);
    if (problem) fail(`geometry.terrain: ${problem}`);
  }
  const segments = (g as Record<string, unknown>).segments;
  if (segments !== undefined) {
    if (!Array.isArray(segments)) return fail('geometry.segments must be an array');
    segments.forEach((x: unknown, i) => {
      if (!isSegment(x)) fail(`geometry.segments[${i}] needs an id, a featureId, garrisonIds, yMin ≤ yMax and a lengthM`);
    });
  }
  const segmentCount = Array.isArray(segments) ? segments.length : 0;
  const units = data.units;
  if (!Array.isArray(units)) return fail('units must be an array (records from engine 0.3.0 on carry it)');
  units.forEach((u: unknown, i) => {
    if (!isUnit(u)) fail(`units[${i}] needs id, battalionId, name and side`);
  });
  const unitIds = new Set((units as Array<{ id: string }>).map((u) => u.id));
  const optionalList = (v: unknown, name: string, ok: (x: unknown) => boolean, what: string): void => {
    if (v === undefined) return;
    if (!Array.isArray(v)) return void fail(`${name} must be an array`);
    v.forEach((x, i) => {
      if (!ok(x)) fail(`${name}[${i}] needs ${what}`);
    });
  };
  optionalList((g as Record<string, unknown>).batteries, 'geometry.batteries', isBattery, 'an id, a side, a weapon, a count and a point `at`');
  optionalList(data.divisions, 'divisions', isDivision, 'an id, a name, a side and, if any, an insignia colour');
  optionalList(data.contactPatrols, 'contactPatrols', isPatrol, 'a fromId, a side, sentMin and dueMin');
  const snapshots = data.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return fail('snapshots must be a non-empty array');
  snapshots.forEach((s: unknown, i) => {
    if (!isObject(s) || !isNum(s.minute) || !isObject(s.companies) || !Array.isArray(s.barrages)) return fail(`snapshots[${i}] needs minute, companies and barrages`);
    // Engine 0.3.13 on: a delta holds only the rows that changed since the snapshot before; the first is a keyframe.
    const delta = s.delta === true;
    if (s.delta !== undefined && !delta) fail(`snapshots[${i}].delta must be true when present`);
    if (delta && i === 0) fail('snapshots[0] must be a keyframe (every row), not a delta');
    const { columns, rows } = s.companies;
    if (!Array.isArray(columns) || !Array.isArray(rows)) return fail(`snapshots[${i}].companies needs columns and rows (records from engine 0.3.0 on are columnar)`);
    const col = Object.fromEntries(NEEDED_COLUMNS.map((c) => [c, columns.indexOf(c)])) as Record<(typeof NEEDED_COLUMNS)[number], number>;
    const missing = NEEDED_COLUMNS.filter((c) => col[c] < 0);
    if (missing.length) fail(`snapshots[${i}].companies.columns lacks ${missing.join(', ')}`);
    rows.forEach((row: unknown, j) => {
      const ok =
        Array.isArray(row) &&
        row.length === columns.length &&
        typeof row[col.id] === 'string' &&
        unitIds.has(row[col.id]) &&
        isNum(row[col.x]) &&
        isNum(row[col.y]) &&
        isNum(row[col.men]) &&
        STATUSES.includes(row[col.status]) &&
        isFrac(row[col.morale]) &&
        isFrac(row[col.suppression]) &&
        (POSTURES as readonly unknown[]).includes(row[col.posture]);
      if (!ok)
        fail(`snapshots[${i}].companies.rows[${j}] needs a value for each column: a unit's id, x, y, men, a known status, morale and suppression from 0 to 1, and a known posture`);
    });
    // Segment state: required in every snapshot of a record whose geometry lists segments (engine 0.3.1 on).
    const seg = s.segments;
    if (segments === undefined) {
      if (seg !== undefined) fail(`snapshots[${i}].segments needs geometry.segments to index`);
    } else {
      if (!isObject(seg) || !Array.isArray(seg.columns) || !Array.isArray(seg.rows)) return fail(`snapshots[${i}].segments needs columns and rows (the record's geometry lists segments)`);
      const sc = seg.columns as unknown[];
      const at = Object.fromEntries(NEEDED_SEGMENT_COLUMNS.map((c) => [c, sc.indexOf(c)])) as Record<(typeof NEEDED_SEGMENT_COLUMNS)[number], number>;
      const lacking = NEEDED_SEGMENT_COLUMNS.filter((c) => at[c] < 0);
      if (lacking.length) fail(`snapshots[${i}].segments.columns lacks ${lacking.join(', ')}`);
      if (delta ? seg.rows.length > segmentCount : seg.rows.length !== segmentCount) fail(`snapshots[${i}].segments needs one row per segment in geometry.segments`);
      seg.rows.forEach((row: unknown, j) => {
        const ok =
          Array.isArray(row) &&
          row.length === sc.length &&
          Number.isInteger(row[at.segment]) &&
          row[at.segment] >= 0 &&
          row[at.segment] < segmentCount &&
          SIDES.includes(row[at.holder]) &&
          isFrac(row[at.wireCut]) &&
          typeof row[at.emerged] === 'boolean';
        if (!ok) fail(`snapshots[${i}].segments.rows[${j}] needs a segment index into geometry.segments, a holder side, wireCut from 0 to 1 and emerged true or false`);
      });
    }
    // Off-map reserves' state: optional (records before engine 0.3.7 have none), checked when present.
    const res = s.reserves;
    if (res !== undefined) {
      if (!isObject(res) || !Array.isArray(res.columns) || !Array.isArray(res.rows)) return fail(`snapshots[${i}].reserves needs columns and rows`);
      const rc = res.columns as unknown[];
      const at = Object.fromEntries(NEEDED_RESERVE_COLUMNS.map((c) => [c, rc.indexOf(c)])) as Record<(typeof NEEDED_RESERVE_COLUMNS)[number], number>;
      const lacking = NEEDED_RESERVE_COLUMNS.filter((c) => at[c] < 0);
      if (lacking.length) fail(`snapshots[${i}].reserves.columns lacks ${lacking.join(', ')}`);
      res.rows.forEach((row: unknown, j) => {
        const ok =
          Array.isArray(row) &&
          row.length === rc.length &&
          typeof row[at.formationId] === 'string' &&
          RESERVE_STATUSES.includes(row[at.status]) &&
          isMinute(row[at.orderedMin]) &&
          isMinute(row[at.arriveMin]);
        if (!ok) fail(`snapshots[${i}].reserves.rows[${j}] needs a formation id, a known status (waiting, ordered, marching or arrived), and orderedMin and arriveMin as minutes or null`);
      });
    }
    // Tanks' state: optional (only runs with tanks have it, engine 0.4.2 on), checked when present.
    const tk = s.tanks;
    if (tk !== undefined) {
      if (!isObject(tk) || !Array.isArray(tk.columns) || !Array.isArray(tk.rows)) return fail(`snapshots[${i}].tanks needs columns and rows`);
      const tc = tk.columns as unknown[];
      const at = Object.fromEntries(NEEDED_TANK_COLUMNS.map((c) => [c, tc.indexOf(c)])) as Record<(typeof NEEDED_TANK_COLUMNS)[number], number>;
      const lacking = NEEDED_TANK_COLUMNS.filter((c) => at[c] < 0);
      if (lacking.length) fail(`snapshots[${i}].tanks.columns lacks ${lacking.join(', ')}`);
      tk.rows.forEach((row: unknown, j) => {
        const ok = Array.isArray(row) && row.length === tc.length && typeof row[at.id] === 'string' && isNum(row[at.x]) && isNum(row[at.y]) && TANK_STATUSES.includes(row[at.status]);
        if (!ok) fail(`snapshots[${i}].tanks.rows[${j}] needs a tank id, x, y and a known status (moving, halted, arrived or bogged)`);
      });
    }
    s.barrages.forEach((b: unknown, j) => {
      if (!isObject(b) || typeof b.sectorId !== 'string' || typeof b.done !== 'boolean' || !Array.isArray(b.points)) fail(`snapshots[${i}].barrages[${j}] needs sectorId, done and points`);
    });
  });
  const events = data.events;
  if (!Array.isArray(events)) return fail('events must be an array');
  events.forEach((e: unknown, i) => {
    if (!isObject(e) || !isNum(e.minute) || typeof e.text !== 'string') fail(`events[${i}] needs a minute and text`);
  });
  const record = data as unknown as RunRecord;
  return { ...record, snapshots: expandDeltas(record.snapshots) };
}

type Table = { columns: readonly string[]; rows: readonly (readonly unknown[])[] };

/** A delta's rows laid over the table before: each row by its key, in the earlier order; a new key goes last. */
function overlay<T extends Table>(before: T, changes: T, key: string): T {
  const k = before.columns.indexOf(key);
  const kc = changes.columns.indexOf(key);
  const at = new Map(changes.rows.map((row) => [row[kc], row]));
  const rows = before.rows.map((row) => {
    const hit = at.get(row[k]);
    if (hit === undefined) return row;
    at.delete(row[k]);
    return hit;
  });
  for (const row of changes.rows) if (at.has(row[kc])) rows.push(row);
  return { ...before, columns: changes.columns, rows } as T;
}

/**
 * Every snapshot in full (the engine's snapshots.ts `expandSnapshots`, which the app may not import): a delta snapshot's
 * rows and barrages laid over the full snapshot before it. Snapshots that are all full are given back as they are.
 */
export function expandDeltas(snapshots: RunRecord['snapshots']): RunRecord['snapshots'] {
  if (!snapshots.some((s) => s.delta)) return snapshots;
  const out: RunRecord['snapshots'] = [];
  let prev: RunRecord['snapshots'][number] | undefined;
  for (const s of snapshots) {
    if (!s.delta || !prev) {
      const { delta: _d, ...whole } = s;
      out.push((prev = whole));
      continue;
    }
    const before = prev;
    const at = new Map(s.barrages.map((b) => [b.sectorId, b]));
    const barrages = before.barrages.map((b) => at.get(b.sectorId) ?? b);
    for (const b of s.barrages) if (!before.barrages.some((x) => x.sectorId === b.sectorId)) barrages.push(b);
    const next: RunRecord['snapshots'][number] = {
      minute: s.minute,
      companies: overlay(before.companies, s.companies, 'id'),
      segments: s.segments ? overlay(before.segments, s.segments, 'segment') : before.segments,
      ...(before.reserves || s.reserves
        ? { reserves: before.reserves && s.reserves ? overlay(before.reserves, s.reserves, 'formationId') : (s.reserves ?? before.reserves)! }
        : {}),
      ...(before.tanks || s.tanks ? { tanks: before.tanks && s.tanks ? overlay(before.tanks, s.tanks, 'id') : (s.tanks ?? before.tanks)! } : {}),
      barrages,
    };
    out.push((prev = next));
  }
  return out;
}
