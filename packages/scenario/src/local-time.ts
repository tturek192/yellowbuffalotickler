import { z } from 'zod';

/** The one time format used in scenario files and run records: local wall-clock time, no zone. */
export const LOCAL_DATETIME_FORMAT = 'YYYY-MM-DDTHH:MM';

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parse 'YYYY-MM-DDTHH:MM' into a Date whose UTC fields hold that wall-clock time, so arithmetic
 * and formatting never depend on the host time zone. Throws on any other text or an impossible date.
 */
export function parseLocalDateTime(text: string): Date {
  const m = PATTERN.exec(text);
  const [y, mo, d, h, mi] = m ? m.slice(1).map(Number) : [];
  const t = m ? new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!)) : null;
  if (
    !t ||
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== mo! - 1 ||
    t.getUTCDate() !== d ||
    t.getUTCHours() !== h ||
    t.getUTCMinutes() !== mi
  ) {
    throw new Error(`expected a local time '${LOCAL_DATETIME_FORMAT}', got "${text}"`);
  }
  return t;
}

export function isLocalDateTime(text: string): boolean {
  try {
    parseLocalDateTime(text);
    return true;
  } catch {
    return false;
  }
}

/** Whole minutes from `from` to `to` (negative when `to` is earlier). */
export function minutesBetween(from: string, to: string): number {
  return (parseLocalDateTime(to).getTime() - parseLocalDateTime(from).getTime()) / 60000;
}

/** The wall-clock time `minutes` after `text`, read through the result's UTC fields. */
export function addMinutes(text: string, minutes: number): Date {
  return new Date(parseLocalDateTime(text).getTime() + minutes * 60000);
}

export const LocalDateTimeSchema = z
  .string()
  .refine(isLocalDateTime, { message: `must be a local time '${LOCAL_DATETIME_FORMAT}'` });
