import type { Outcome } from '@wwi/sandbox';
import { SETTINGS } from '@wwi/sandbox';

const pad = (n: number) => String(n).padStart(2, '0');
/** Time since Zero as "day N · hh:mm". */
export function clockText(minute: number): string {
  const d = Math.floor(minute / 1440), r = minute % 1440;
  return `day ${d + 1} · ${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
}
/** Game minutes per real second at each speed: 1× plays two days (2,880 min) in four minutes. */
export const minutesPerSecond = (speed: number) => speed * 12;

const WHY: Record<NonNullable<Outcome['by']>, string> = {
  breakthrough: 'breakthrough past the guns', surrender: 'mass surrender', collapse: 'the defence collapsed', stronghold: 'stronghold taken and held',
};
export function resultText(o: Outcome, holdMin = SETTINGS.strongholdHoldMin): { headline: string; detail: string } {
  if (o.ended === 'nothing-to-fight') return { headline: 'Nothing to fight: both sides need units', detail: '' };
  const m = o.margins;
  const gun = !Number.isFinite(m.beyondGunLineM) ? 'no enemy guns to reach' : m.beyondGunLineM > 0 ? `${Math.round(m.beyondGunLineM)} m past the gun line` : `${Math.round(-m.beyondGunLineM)} m short of the gun line`;
  const detail = `Closest: ${gun}, ${Math.round(m.capturedFrac * 100)}% of defenders captured, ${Math.round(m.fitFrac * 100)}% still fit, stronghold held ${Math.min(m.longestHoldMin, holdMin)} of ${holdMin} min.`;
  if (o.broken && o.by) return { headline: `Deadlock broken: ${WHY[o.by]}, ${clockText(o.minute ?? 0)}`, detail };
  return { headline: 'Deadlock held', detail };
}
/** Game minutes for one animation frame; a gap longer than a quarter second (a hidden tab) is cut short, so nothing happens unseen. */
export const minutesForFrame = (dtMs: number, speed: number) => (Math.min(dtMs, 250) / 1000) * minutesPerSecond(speed);
