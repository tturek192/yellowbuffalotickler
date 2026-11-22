import type { CompanyStatus, Side } from '@wwi/engine';
import { MAP_COLORS, MARKER_FONT, sideColor } from './style';

/**
 * How unit markers look: every number the marker drawing uses is here, so the whole set can be restyled in one place
 * (the map key draws its samples from the same constants).
 */
export const MARKER_STYLE = {
  company: { w: 26, h: 16 },
  /** Battalion markers are taller, carry the NATO "II" and grow to fit their label. */
  battalion: { minW: 34, h: 20, padX: 6 },
  barH: 3,
  /** A chip's strength bar is thinner. */
  chipBarH: 2,
  barGap: 2,
  /** Room one marker needs vertically: box, gap, bar, air. */
  pitch: (h: number): number => h + 8,
  minMoraleAlpha: 0.55,
  destroyed: '#8d877a',
  hatch: 'rgba(255, 255, 255, 0.6)',
  hatchStep: 4,
  flag: '#ffffff',
  arrow: MAP_COLORS.ink,
  suppression: '#d9822b',
  /** The inside of an open (waiting or reserve) period block: the paper. */
  openFill: '#efe2bf',
  /** Seconds a suppression ring takes to pulse once. */
  pulseSeconds: 1.4,
} as const;

export type MarkerLook = 'solid' | 'hatched' | 'falling-back' | 'surrendered' | 'destroyed';

/** The look of a status: morale is the fill (solid steady, hatched pinned) with a mark for a rout, a surrender or a loss. */
export function markerLook(status: CompanyStatus): MarkerLook {
  switch (status) {
    case 'pinned':
      return 'hatched';
    case 'falling-back':
      return 'falling-back';
    case 'surrendered':
      return 'surrendered';
    case 'destroyed':
      return 'destroyed';
    default:
      return 'solid';
  }
}

/** The fill's opacity: full at morale 1, fading (never out) as it falls. */
export function moraleAlpha(morale: number): number {
  const m = Math.min(Math.max(morale, 0), 1);
  return MARKER_STYLE.minMoraleAlpha + (1 - MARKER_STYLE.minMoraleAlpha) * m;
}

/** The strength bar's fill, 0 to 1, against the men at Zero. */
export function strengthRatio(men: number, full: number): number {
  return full > 0 ? Math.max(0, Math.min(1, men / full)) : 0;
}

/**
 * The suppression ring at `phase` (cycles; only the fractional part counts): how far past the marker's edge it has
 * spread, in pixels, and how opaque it is. Null below a whisper of suppression. A pure function, so the wall-clock
 * pulse never touches the record.
 */
export function pulseRing(suppression: number, phase: number): { radius: number; alpha: number } | null {
  if (!(suppression >= 0.05)) return null;
  const s = Math.min(suppression, 1);
  const p = phase - Math.floor(phase);
  return { radius: 3 + p * (4 + 8 * s), alpha: (0.25 + 0.6 * s) * (1 - p) };
}

/** The phase (cycles) of the pulse at wall-clock time `ms`. */
export const pulsePhase = (ms: number): number => ms / 1000 / MARKER_STYLE.pulseSeconds;

export type UnitMarker = {
  /** Centre of the marker, screen px. */
  at: readonly [number, number];
  w: number;
  h: number;
  label: string;
  side: Side;
  status: CompanyStatus;
  morale: number;
  suppression: number;
  men: number;
  /** Men at Zero, for the strength bar. */
  full: number;
  /** A battalion: draws the "II" above the box. */
  battalion?: boolean;
  /** A compact chip: no text and no II, a thinner bar; the state marks stay. */
  chip?: boolean;
  /** Pulse phase in cycles (wall time, not battle time). */
  phase: number;
  /**
   * The period style's paint (Task 20): the block's colour (its division's patch), open (outline only: waiting or in
   * reserve) or filled, and its edge. Absent: the plain style, the side's ink.
   */
  paint?: { fill: string; open: boolean; edge: string; edgeWidth: number };
};

/** Draw one marker (a company or a battalion): fill, edge, label, strength bar, and the state marks. */
export function drawUnitMarker(ctx: CanvasRenderingContext2D, m: UnitMarker): void {
  const { w, h } = m;
  const x = Math.round(m.at[0] - w / 2);
  const y = Math.round(m.at[1] - h / 2);
  const look = markerLook(m.status);
  const color = look === 'destroyed' ? MARKER_STYLE.destroyed : (m.paint?.fill ?? sideColor(m.side));
  const open = m.paint?.open === true && look !== 'destroyed';

  // Suppression: a ring that spreads from the edge and fades, drawn under the box.
  const ring = look === 'destroyed' ? null : pulseRing(m.suppression, m.phase);
  if (ring) {
    ctx.save();
    ctx.globalAlpha = ring.alpha;
    ctx.strokeStyle = MARKER_STYLE.suppression;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - ring.radius, y - ring.radius, w + 2 * ring.radius, h + 2 * ring.radius);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(40, 30, 10, 0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.globalAlpha = look === 'destroyed' ? 0.55 : open ? 1 : moraleAlpha(m.morale);
  ctx.fillStyle = open ? MARKER_STYLE.openFill : color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  if (look === 'hatched') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = open ? color : MARKER_STYLE.hatch;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = -h; k <= w; k += MARKER_STYLE.hatchStep) {
      ctx.moveTo(x + k, y + h);
      ctx.lineTo(x + k + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (m.status === 'consolidating') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.strokeStyle = 'rgba(20, 16, 8, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
  } else if (m.paint && look !== 'destroyed') {
    // Period blocks: an open block is drawn in its colour's outline; a filled one keeps its edge (German: red).
    const lw = open ? Math.max(2, m.paint.edgeWidth) : m.paint.edgeWidth;
    ctx.strokeStyle = open && m.side !== 'central' ? color : m.paint.edge;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  } else if (m.side === 'central' && look !== 'destroyed') {
    ctx.strokeStyle = MAP_COLORS.centralEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  } else {
    ctx.strokeStyle = 'rgba(20, 16, 8, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  if (!m.chip) {
    ctx.fillStyle = look === 'destroyed' ? 'rgba(255, 255, 255, 0.7)' : open ? MAP_COLORS.ink : '#ffffff';
    ctx.font = `600 11px ${MARKER_FONT}`;
    // Longer labels step down a size to stay inside the marker.
    if (ctx.measureText(m.label).width > w - 4) ctx.font = `600 9.5px ${MARKER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, x + w / 2, y + h / 2 + 0.5);
  }

  if (m.battalion && !m.chip) {
    // The battalion sign: two short strokes above the box.
    ctx.strokeStyle = MAP_COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const dx of [-2.5, 2.5]) {
      ctx.moveTo(x + w / 2 + dx, y - 1);
      ctx.lineTo(x + w / 2 + dx, y - 5);
    }
    ctx.stroke();
  }

  if (look === 'falling-back') {
    // An arrow back towards its own lines: west for the allies, east for the Germans.
    const dir = m.side === 'central' ? 1 : -1;
    const edge = dir > 0 ? x + w : x;
    const ay = y + h / 2;
    ctx.strokeStyle = MARKER_STYLE.arrow;
    ctx.fillStyle = MARKER_STYLE.arrow;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(edge + dir * 2, ay);
    ctx.lineTo(edge + dir * 11, ay);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(edge + dir * 15, ay);
    ctx.lineTo(edge + dir * 9, ay - 4);
    ctx.lineTo(edge + dir * 9, ay + 4);
    ctx.closePath();
    ctx.fill();
  }

  if (look === 'surrendered') {
    // A white flag on a pole at the top right.
    const px = x + w - 3;
    ctx.strokeStyle = MAP_COLORS.ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(px, y + 2);
    ctx.lineTo(px, y - 12);
    ctx.stroke();
    ctx.fillStyle = MARKER_STYLE.flag;
    ctx.beginPath();
    ctx.moveTo(px, y - 12);
    ctx.lineTo(px - 10, y - 9);
    ctx.lineTo(px, y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  // Holding companies (garrisons, reserves) have no attack to wear them down: no strength bar. Nor has the dead.
  if (m.status === 'holding' || look === 'destroyed') return;
  const by = y + h + MARKER_STYLE.barGap;
  const barH = m.chip ? MARKER_STYLE.chipBarH : MARKER_STYLE.barH;
  ctx.fillStyle = 'rgba(59, 51, 38, 0.25)';
  ctx.fillRect(x, by, w, barH);
  ctx.fillStyle = MAP_COLORS.ink;
  ctx.fillRect(x, by, Math.round(w * strengthRatio(m.men, m.full)), barH);
}
