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
