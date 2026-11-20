/** The first event minute strictly after the playhead, or null. */
export function nextEventMinute(eventMinutes: readonly number[], minute: number): number | null {
  let best: number | null = null;
  for (const m of eventMinutes) if (m > minute && (best === null || m < best)) best = m;
  return best;
}

/** The last event minute strictly before the whole minute on the clock, or null. */
export function prevEventMinute(eventMinutes: readonly number[], minute: number): number | null {
  const shown = Math.floor(minute);
  let best: number | null = null;
  for (const m of eventMinutes) if (m < shown && (best === null || m > best)) best = m;
  return best;
}

export function elapsedLabel(minute: number): string {
  const whole = Math.floor(minute);
  return `${Math.floor(whole / 60)} h ${whole % 60} min after zero hour`;
}

/** The ±window around an event inside which playback is never quiet (matches isQuiet's default). */
export const QUIET_WINDOW_MIN = 20;

/**
 * Cap a quiet-accelerated advance from `from` to `to` so it stops where the next event's quiet window
 * begins; a single fast frame then can never carry the playhead past an event.
 */
export function capQuietAdvance(from: number, to: number, eventMinutes: readonly number[], windowMin = QUIET_WINDOW_MIN): number {
  const next = nextEventMinute(eventMinutes, from);
  if (next === null) return to;
  const limit = next - windowMin;
  return limit > from ? Math.min(to, limit) : to;
}
