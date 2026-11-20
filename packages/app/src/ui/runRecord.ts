import type { RunRecord } from '@wwi/engine';
import { FEATURE_KINDS, isLocalDateTime, LOCAL_DATETIME_FORMAT } from '@wwi/scenario';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPoint = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isPoints = (v: unknown, min: number): boolean => Array.isArray(v) && v.length >= min && v.every(isPoint);

const SIDES: readonly unknown[] = ['allied', 'central'];
const STATUSES: readonly unknown[] = ['waiting', 'advancing', 'consolidating', 'holding'];
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

const isCompany = (c: unknown): boolean =>
  isObject(c) && typeof c.id === 'string' && SIDES.includes(c.side) && isNum(c.x) && isNum(c.y) && isNum(c.strength) && STATUSES.includes(c.status);

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
  const snapshots = data.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return fail('snapshots must be a non-empty array');
  snapshots.forEach((s: unknown, i) => {
    if (!isObject(s) || !isNum(s.minute) || !Array.isArray(s.companies) || !Array.isArray(s.barrages)) return fail(`snapshots[${i}] needs minute, companies and barrages`);
    s.companies.forEach((c: unknown, j) => {
      if (!isCompany(c)) fail(`snapshots[${i}].companies[${j}] needs id, side, x, y, strength and a known status`);
    });
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
