import { v } from '@wwi/scenario';
import type { Doctrine, Formation, Scenario, Tables } from '@wwi/scenario';
import { byId } from './companies';

type Company = NonNullable<Formation['companies']>[number];

/** Company values the model needs that a scenario may leave out, each filled from the doctrine's companyDefaults. */
const FROM_DOCTRINE = ['officers', 'lewisGuns', 'machineGuns'] as const;

/**
 * Fill every absent optional value the model needs, and list each one filled, e.g.
 * `companies[1cdn-1bn-a].officers ← bef-1917.companyDefaults.officers`, so nothing changes silently
 * (Review Focus 2). The list is in ascending company id order, whatever the order of the file.
 * The scenario passed in is not changed. `tables` is for defaults drawn from `tables.effects` (later tasks).
 */
export function resolveDefaults(
  s: Scenario,
  doctrines: Record<string, Doctrine>,
  _tables: Tables,
): { scenario: Scenario; used: string[] } {
  const filled: Array<{ id: string; entries: string[] }> = [];
  const fill = (c: Company, doctrineId: string): Company => {
    const d = doctrines[doctrineId];
    if (!d) throw new Error(`Unknown doctrine "${doctrineId}"`);
    const out: Company = { ...c };
    const entries: string[] = [];
    for (const k of FROM_DOCTRINE) {
      if (c[k] !== undefined) continue;
      const path = `${doctrineId}.companyDefaults.${k}`;
      out[k] = { value: v(d.companyDefaults[k]), estimate: `doctrine default (${path})` };
      entries.push(`companies[${c.id}].${k} ← ${path}`);
    }
    if (c.training === undefined) {
      // Not a model number: a company the sources do not show rehearsing is taken as standard (the larger NCO penalty).
      out.training = 'standard';
      entries.push(`companies[${c.id}].training ← standard (no training given)`);
    }
    filled.push({ id: c.id, entries });
    return out;
  };
  const walk = (f: Formation, doctrineId: string): Formation => ({
    ...f,
    ...(f.companies ? { companies: f.companies.map((c) => fill(c, doctrineId)) } : {}),
    ...(f.children ? { children: f.children.map((ch) => walk(ch, doctrineId)) } : {}),
  });
  const scenario: Scenario = {
    ...s,
    forces: s.forces.map((force) => ({ ...force, formations: force.formations.map((f) => walk(f, force.doctrine)) })),
  };
  const used = filled.sort(byId).flatMap((x) => x.entries);
  return { scenario, used };
}
