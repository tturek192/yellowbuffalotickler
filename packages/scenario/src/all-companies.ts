import type { Formation, Scenario } from './schema';

type Company = NonNullable<Formation['companies']>[number];

/** Every company in the scenario, flattening each formation tree depth-first in file order. */
export function allCompanies(s: Scenario): Company[] {
  const out: Company[] = [];
  const walk = (f: Formation): void => {
    out.push(...(f.companies ?? []));
    for (const c of f.children ?? []) walk(c);
  };
  for (const force of s.forces) for (const f of force.formations) walk(f);
  return out;
}
