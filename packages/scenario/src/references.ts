import type { Scenario, Formation } from './schema';
import { historicalTierRule } from './sources';

/** Collect every Sourced-looking object ({ value, source }) in a tree, with its dotted path. */
export function collectSourceRefs(node: unknown, path: string, out: { path: string; id: string }[] = []) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectSourceRefs(n, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('value' in o && typeof o.source === 'string') out.push({ path: `${path}.source`, id: o.source });
    if ('value' in o && Array.isArray(o.sources)) {
      o.sources.forEach((c, i) => {
        const id = (c as { source?: unknown } | null)?.source;
        if (typeof id === 'string') out.push({ path: `${path}.sources[${i}].source`, id });
      });
    }
    for (const [k, val] of Object.entries(o)) {
      if (k === 'sources' && !Array.isArray(val)) continue; // the source registry itself
      collectSourceRefs(val, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

export function checkReferences(s: Scenario, doctrineIds: string[]): string[] {
  const problems: string[] = [];
  const lineIds = new Set(s.lines.map((l) => l.id));
  const sectorIds = new Set(s.sectors.map((x) => x.id));
  const sourceIds = new Set(Object.keys(s.sources));

  const seen = new Set<string>();
  const dup = (path: string, id: string) => {
    if (seen.has(id)) problems.push(`${path}: duplicate id "${id}"`);
    seen.add(id);
  };
  s.lines.forEach((l, i) => dup(`lines[${i}].id`, l.id));
  s.sectors.forEach((x, i) => dup(`sectors[${i}].id`, x.id));

  const walkFormations = (fs: Formation[], base: string) =>
    fs.forEach((f, i) => {
      const fp = `${base}[${i}]`;
      dup(`${fp}.id`, f.id);
      f.companies?.forEach((c, j) => {
        const cp = `${fp}.companies[${j}]`;
        dup(`${cp}.id`, c.id);
        if (!sectorIds.has(c.sectorId)) problems.push(`${cp}.sectorId: unknown sector "${c.sectorId}"`);
        if (!lineIds.has(c.objectiveLineId)) problems.push(`${cp}.objectiveLineId: unknown line "${c.objectiveLineId}"`);
      });
      if (f.children) walkFormations(f.children, `${fp}.children`);
    });
  s.forces.forEach((force, i) => {
    if (!doctrineIds.includes(force.doctrine)) {
      problems.push(`forces[${i}].doctrine: unknown doctrine "${force.doctrine}"`);
    }
    walkFormations(force.formations, `forces[${i}].formations`);
  });

  s.sectors.forEach((x, i) => {
    if (!lineIds.has(x.startLineId)) problems.push(`sectors[${i}].startLineId: unknown line "${x.startLineId}"`);
    x.legs.forEach((leg, j) => {
      if (!lineIds.has(leg.toLineId)) problems.push(`sectors[${i}].legs[${j}].toLineId: unknown line "${leg.toLineId}"`);
    });
  });

  s.historical.objectives.forEach((o, i) => {
    if (!lineIds.has(o.lineId)) problems.push(`historical.objectives[${i}].lineId: unknown line "${o.lineId}"`);
    if (!sectorIds.has(o.sectorId)) problems.push(`historical.objectives[${i}].sectorId: unknown sector "${o.sectorId}"`);
  });

  for (const r of collectSourceRefs(s, '')) {
    if (!sourceIds.has(r.id)) problems.push(`${r.path}: unknown source "${r.id}"`);
  }
  problems.push(...historicalTierRule(s));
  return problems;
}
