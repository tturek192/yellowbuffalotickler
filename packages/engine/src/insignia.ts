import { v, type Formation, type Scenario } from '@wwi/scenario';
import type { Side } from './types';

/** A division (or a group the scenario enters in a division's place) as the map's notes name it, with its patch colour. */
export type DivisionInsignia = { id: string; name: string; side: Side; insignia?: string; noPatch?: true };

/**
 * Each company's insignia colour, from the nearest formation up its path that has one (`formationPath`, battalion up).
 * A formation whose insignia is `none` (a source says it wore no patch: an attached brigade) stops the search, so its
 * battalions do not inherit their parent's patch. A company with no colour is drawn in its side's colour: each formation
 * where that happens is listed once in defaultsUsed (the `none` formation, else the company's division). Also the
 * divisions (kind `division` or `group`) in scenario order, for the map's notes, with any formation that wore no patch
 * (`noPatch`: an attached brigade is then named apart from the division it fought under).
 */
export function insigniaOf(
  s: Pick<Scenario, 'forces'>,
  units: ReadonlyArray<{ id: string; formationPath: readonly string[] }>,
  defaultsUsed: Set<string>,
): { byUnit: Map<string, string>; divisions: DivisionInsignia[] } {
  const formations = new Map<string, Formation>();
  const divisions: DivisionInsignia[] = [];
  const visit = (f: Formation, side: Side): void => {
    formations.set(f.id, f);
    const c = f.insignia ? v(f.insignia.colour) : undefined;
    if (f.kind === 'division' || f.kind === 'group' || c === 'none') {
      divisions.push({ id: f.id, name: f.name, side, ...(c === 'none' ? { noPatch: true as const } : c ? { insignia: c } : {}) });
    }
    for (const child of f.children ?? []) visit(child, side);
  };
  for (const force of s.forces) for (const f of force.formations) visit(f, force.side);

  const byUnit = new Map<string, string>();
  for (const u of units) {
    let colour: string | undefined;
    let stop: string | undefined;
    for (const id of u.formationPath) {
      const ins = formations.get(id)?.insignia;
      if (!ins) continue;
      const c = v(ins.colour);
      if (c === 'none') stop = id;
      else colour = c;
      break;
    }
    if (colour) {
      byUnit.set(u.id, colour);
      continue;
    }
    if (stop) defaultsUsed.add(`insignia: ${stop} ← side colour (wore none)`);
    else {
      const div = u.formationPath.find((id) => ['division', 'group'].includes(formations.get(id)?.kind ?? '')) ?? u.formationPath[0] ?? u.id;
      defaultsUsed.add(`insignia: ${div} ← side colour (no insignia)`);
    }
  }
  return { byUnit, divisions };
}
