import type { RunRecord } from '@wwi/engine';
import { isLocalDateTime, LOCAL_DATETIME_FORMAT } from '@wwi/scenario';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
  const snapshots = data.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return fail('snapshots must be a non-empty array');
  snapshots.forEach((s: unknown, i) => {
    if (!isObject(s) || !isNum(s.minute) || !Array.isArray(s.companies) || !Array.isArray(s.barrages)) fail(`snapshots[${i}] needs minute, companies and barrages`);
  });
  const events = data.events;
  if (!Array.isArray(events)) return fail('events must be an array');
  events.forEach((e: unknown, i) => {
    if (!isObject(e) || !isNum(e.minute) || typeof e.text !== 'string') fail(`events[${i}] needs a minute and text`);
  });
  return data as unknown as RunRecord;
}
