import type { Company, Formation, Scenario } from './schema';
import { projectLonLat } from './frame';

type Side = Scenario['forces'][number]['side'];
type Leader = Scenario['leaders'][number];
/** A company's start: local metres, or lon/lat for the frame to project. */
type Start = Company['start'];

/** A formation together with the side of the force it belongs to. */
export type SidedFormation = Formation & { side: Side };

/** Every formation in the scenario with its side, depth-first in file order. */
export function allFormations(s: Scenario): SidedFormation[] {
  const out: SidedFormation[] = [];
  const walk = (f: Formation, side: Side): void => {
    out.push({ ...f, side });
    for (const c of f.children ?? []) walk(c, side);
  };
  for (const force of s.forces) for (const f of force.formations) walk(f, force.side);
  return out;
}

export function formation(s: Scenario, id: string): SidedFormation {
  const f = allFormations(s).find((x) => x.id === id);
  if (!f) throw new Error(`unknown formation "${id}"`);
  return f;
}

export function formationIds(s: Scenario, side: Side): string[] {
  return allFormations(s).filter((f) => f.side === side).map((f) => f.id);
}

const descendants = (f: Formation): Formation[] => (f.children ?? []).flatMap((c) => [c, ...descendants(c)]);

/** The regiments under a division, at any depth, in file order. */
export function regimentsOf(s: Scenario, divisionId: string): Formation[] {
  return descendants(formation(s, divisionId)).filter((f) => f.kind === 'regiment');
}

export function battalions(s: Scenario, side: Side): SidedFormation[] {
  return allFormations(s).filter((f) => f.side === side && f.kind === 'battalion');
}

export function companiesOf(s: Scenario, side: Side): Company[] {
  return allFormations(s).filter((f) => f.side === side).flatMap((f) => f.companies ?? []);
}

/** Companies that advance on an objective line (assault, mop-up and support), on either side. */
export function attackingCompanies(s: Scenario): Company[] {
  return allFormations(s)
    .flatMap((f) => f.companies ?? [])
    .filter((c) => c.role === 'assault' || c.role === 'mopup' || c.role === 'support');
}

/** The id of the division a company serves under (its nearest division ancestor), e.g. '1cdn'. */
export function divisionOf(s: Scenario, company: Company): string {
  const find = (f: Formation, division: string | undefined): string | undefined | null => {
    const here = f.kind === 'division' ? f.id : division;
    if (f.companies?.some((c) => c.id === company.id)) return here ?? null;
    for (const c of f.children ?? []) {
      const r = find(c, here);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  for (const force of s.forces) {
    for (const f of force.formations) {
      const r = find(f, undefined);
      if (r === null) throw new Error(`company ${company.id} serves under no division`);
      if (r !== undefined) return r;
    }
  }
  throw new Error(`unknown company "${company.id}"`);
}

export function leader(s: Scenario, id: string): Leader {
  const l = s.leaders.find((x) => x.id === id);
  if (!l) throw new Error(`unknown leader "${id}"`);
  return l;
}

/** Whether a start (local, or lon/lat projected with the frame) lies inside the frame's extent. */
export function inExtent(s: Scenario, start: Start): boolean {
  if (!s.frame) throw new Error('the scenario has no frame, so no extent');
  const [x, y] = Array.isArray(start) ? start : projectLonLat(s.frame, start.lonLat);
  const e = s.frame.extent;
  return x >= e.minX && x <= e.maxX && y >= e.minY && y <= e.maxY;
}
