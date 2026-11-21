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
  isObject(u) && typeof u.id === 'string' && typeof u.battalionId === 'string' && typeof u.name === 'string' && SIDES.includes(u.side);

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
  const snapshots = data.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return fail('snapshots must be a non-empty array');
  snapshots.forEach((s: unknown, i) => {
    if (!isObject(s) || !isNum(s.minute) || !isObject(s.companies) || !Array.isArray(s.barrages)) return fail(`snapshots[${i}] needs minute, companies and barrages`);
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
      if (seg.rows.length !== segmentCount) fail(`snapshots[${i}].segments needs one row per segment in geometry.segments`);
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
    s.barrages.forEach((b: unknown, j) => {
      if (!isObject(b) || typeof b.sectorId !== 'string' || typeof b.done !== 'boolean' || !Array.isArray(b.points)) fail(`snapshots[${i}].barrages[${j}] needs sectorId, done and points`);
    });
  });
  const events = data.events;
  if (!Array.isArray(events)) return fail('events must be an array');
  events.forEach((e: unknown, i) => {
    if (!isObject(e) || !isNum(e.minute) || typeof e.text !== 'string') fail(`events[${i}] needs a minute and text`);
  });
  return data as unknown as RunRecord;
}
