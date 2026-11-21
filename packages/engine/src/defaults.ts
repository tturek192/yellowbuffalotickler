import { ScenarioError, v } from '@wwi/scenario';
import type { Doctrine, Formation, Scenario, Tables } from '@wwi/scenario';
import { byId } from './companies';

type Company = NonNullable<Formation['companies']>[number];

/** Company values the model needs that a scenario may leave out, each filled from the doctrine's companyDefaults. */
const FROM_DOCTRINE = ['officers', 'lewisGuns', 'machineGuns'] as const;

/**
 * Fill every absent optional value the model needs, and list each one filled, e.g.
 * `companies[1cdn-1bn-a].officers ← bef-1917.companyDefaults.officers`, so nothing changes silently
 * (Review Focus 2). The list is in ascending company id order, whatever the order of the file.
 * An off-map reserve with no companies gets companies made up from its doctrine (`withReserveCompanies`).
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
    if (c.role === 'garrison' && c.dugoutDepthM === undefined) {
      // Only a garrison shelters in dugouts under the bombardment (its trench segment's depth).
      const path = `${doctrineId}.companyDefaults.dugoutDepthM`;
      out.dugoutDepthM = { value: v(d.companyDefaults.dugoutDepthM), estimate: `doctrine default (${path})` };
      entries.push(`companies[${c.id}].dugoutDepthM ← ${path}`);
    }
    if (c.training === undefined) {
      // Not a model number: a company the sources do not show rehearsing is taken as standard (the larger NCO penalty).
      out.training = 'standard';
      entries.push(`companies[${c.id}].training ← standard (no training given)`);
    }
    filled.push({ id: c.id, entries });
    return out;
  };
  const reserves = new Map(s.reserves.map((r) => [r.formationId, r]));
  const made: string[] = [];
  const walk = (f0: Formation, doctrineId: string): Formation => {
    const r = reserves.get(f0.id);
    const f = r ? withReserveCompanies(f0, r, doctrines[doctrineId], doctrineId, made) : f0;
    return {
      ...f,
      ...(f.companies ? { companies: f.companies.map((c) => fill(c, doctrineId)) } : {}),
      ...(f.children ? { children: f.children.map((ch) => walk(ch, doctrineId)) } : {}),
    };
  };
  const scenario: Scenario = {
    ...s,
    forces: s.forces.map((force) => ({ ...force, formations: force.formations.map((f) => walk(f, force.doctrine)) })),
  };
  const used = [...filled.sort(byId).flatMap((x) => x.entries), ...made.sort()];
  return { scenario, used };
}

const hasCompanies = (f: Formation): boolean => (f.companies?.length ?? 0) > 0 || (f.children ?? []).some(hasCompanies);

/**
 * An off-map reserve formation with no companies anywhere in it (Task 13) gets them from its doctrine: a battalion
 * `companiesPerBattalion` companies of `strength` men, `<battalion>-g1`, `-g2`, …; a division with no battalions
 * `battalionsPerDivision` battalions `<division>-bn1`, … of those. Each company is a reserve standing at the reserve's
 * entry point, with the doctrine's officers, light and heavy machine guns and standard training, so fire, morale and
 * command treat it as any other. One `defaultsUsed` line per reserve says what was made. A reserve that has companies
 * keeps them; one of another kind with none cannot be made up and is rejected.
 */
function withReserveCompanies(f: Formation, r: Scenario['reserves'][number], d: Doctrine | undefined, doctrineId: string, made: string[]): Formation {
  if (hasCompanies(f)) return f;
  if (!d) throw new Error(`Unknown doctrine "${doctrineId}"`);
  if (!Array.isArray(r.entryPoint)) throw new Error(`Reserve ${r.formationId}: entryPoint was not projected to a local point`);
  if (f.kind !== 'battalion' && f.kind !== 'division')
    throw new ScenarioError([`reserves[${f.id}]: a ${f.kind} with no companies; the engine can make up companies only for a battalion or a division, so give it battalions or companies`]);
  const k = d.companyDefaults;
  const at: [number, number] = [r.entryPoint[0], r.entryPoint[1]];
  const est = (value: number, key: string) => ({ value, estimate: `doctrine default (${doctrineId}.companyDefaults.${key})` });
  const companiesOf = (b: { id: string; name: string }): Company[] =>
    Array.from({ length: v(k.companiesPerBattalion) }, (_, i) => ({
      id: `${b.id}-g${i + 1}`,
      name: `${b.name}, company ${i + 1} (made up)`,
      role: 'reserve',
      strength: est(v(k.strength), 'strength'),
      start: at,
      officers: est(v(k.officers), 'officers'),
      lewisGuns: est(v(k.lewisGuns), 'lewisGuns'),
      machineGuns: est(v(k.machineGuns), 'machineGuns'),
      training: 'standard',
    }));
  const p = `${doctrineId}.companyDefaults`;
  const each = `${v(k.companiesPerBattalion)} companies (${p}.companiesPerBattalion) of ${v(k.strength)} men (${p}.strength); officers, lewisGuns, machineGuns from ${p}, training standard`;
  const hasBattalions = (x: Formation): boolean => x.kind === 'battalion' || (x.children ?? []).some(hasBattalions);
  if (f.kind === 'battalion') {
    made.push(`reserves[${f.id}] ← ${each}`);
    return { ...f, companies: companiesOf(f) };
  }
  if (hasBattalions(f)) throw new ScenarioError([`reserves[${f.id}]: its battalions have no companies; give them companies, or make the battalions reserves of their own`]);
  const n = v(k.battalionsPerDivision);
  made.push(`reserves[${f.id}] ← ${n} battalions (${p}.battalionsPerDivision) of ${each}`);
  const battalions = Array.from({ length: n }, (_, i) => ({ id: `${f.id}-bn${i + 1}`, name: `${f.name}, battalion ${i + 1} (made up)` }));
  return { ...f, children: [...(f.children ?? []), ...battalions.map((b): Formation => ({ ...b, kind: 'battalion', companies: companiesOf(b) }))] };
}
