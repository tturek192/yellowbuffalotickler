import type { Scenario, Formation } from './schema';
import { historicalTierRule } from './sources';
import { parseLocalDateTime } from './local-time';
import { locateProblem } from './include';

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

/**
 * Problems with ids and cross-references, each `path: message`. `locate` rewrites a merged-scenario path to
 * name its file and the index within it (see Provenance); a duplicate id names where the first copy is.
 */
export function checkReferences(s: Scenario, doctrineIds: string[], locate: (path: string) => string = (p) => p): string[] {
  const problems: string[] = [];
  /** A duplicate-id check over one id namespace, remembering where each id was first defined. */
  const dupCheck = () => {
    const first = new Map<string, string>();
    return (path: string, id: string) => {
      const at = first.get(id);
      if (at !== undefined) problems.push(`${path}: duplicate id "${id}" (first defined at ${locate(at)})`);
      else first.set(id, path);
    };
  };
  const lineIds = new Set(s.lines.map((l) => l.id));
  const sectorIds = new Set(s.sectors.map((x) => x.id));
  const sourceIds = new Set(Object.keys(s.sources));

  const dup = dupCheck();
  s.lines.forEach((l, i) => dup(`lines[${i}].id`, l.id));
  s.sectors.forEach((x, i) => dup(`sectors[${i}].id`, x.id));
  const dupFeature = dupCheck();
  s.features.forEach((f, i) => dupFeature(`features[${i}].id`, f.id));

  const leaderIds = new Set(s.leaders.map((l) => l.id));
  const dupLeader = dupCheck();
  s.leaders.forEach((l, i) => dupLeader(`leaders[${i}].id`, l.id));
  const featureKind = new Map(s.features.map((f) => [f.id, f.kind]));
  const formationIds = new Set<string>();
  const collectIds = (fs: Formation[]) =>
    fs.forEach((f) => {
      formationIds.add(f.id);
      if (f.children) collectIds(f.children);
    });
  s.forces.forEach((force) => collectIds(force.formations));
  const checkFormation = (path: string, id: string | undefined) => {
    if (id !== undefined && !formationIds.has(id)) problems.push(`${path}: unknown formation "${id}"`);
  };

  const walkFormations = (fs: Formation[], base: string) =>
    fs.forEach((f, i) => {
      const fp = `${base}[${i}]`;
      dup(`${fp}.id`, f.id);
      if (f.leaderId !== undefined && !leaderIds.has(f.leaderId)) {
        problems.push(`${fp}.leaderId: unknown leader "${f.leaderId}"`);
      }
      f.companies?.forEach((c, j) => {
        const cp = `${fp}.companies[${j}]`;
        dup(`${cp}.id`, c.id);
        if (c.sectorId !== undefined && !sectorIds.has(c.sectorId)) problems.push(`${cp}.sectorId: unknown sector "${c.sectorId}"`);
        if (c.objectiveLineId !== undefined && !lineIds.has(c.objectiveLineId)) {
          problems.push(`${cp}.objectiveLineId: unknown line "${c.objectiveLineId}"`);
        }
        if (c.trenchFeatureId !== undefined) {
          const kind = featureKind.get(c.trenchFeatureId);
          if (kind === undefined) problems.push(`${cp}.trenchFeatureId: unknown feature "${c.trenchFeatureId}"`);
          else if (kind !== 'trench' && kind !== 'strongpoint') {
            problems.push(`${cp}.trenchFeatureId: feature "${c.trenchFeatureId}" is a ${kind}; must be a trench or strongpoint`);
          }
        }
        if (!Array.isArray(c.start)) problems.push(`${cp}.start: lonLat start needs the node loader (and a frame) to project it`);
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

  s.reserves.forEach((x, i) => {
    checkFormation(`reserves[${i}].formationId`, x.formationId);
    if (!Array.isArray(x.entryPoint)) problems.push(`reserves[${i}].entryPoint: lonLat needs the node loader (and a frame) to project it`);
  });
  const dupArtillery = dupCheck();
  s.artillery.forEach((a, i) => {
    dupArtillery(`artillery[${i}].id`, a.id);
    checkFormation(`artillery[${i}].formationId`, a.formationId);
  });
  s.weather.forEach((w, i) => {
    if (i > 0 && parseLocalDateTime(w.at).getTime() <= parseLocalDateTime(s.weather[i - 1]!.at).getTime()) {
      problems.push(`weather[${i}].at: must be after weather[${i - 1}].at`);
    }
  });
  s.historical.casualties.forEach((c, i) => checkFormation(`historical.casualties[${i}].formationId`, c.formationId));
  s.historical.reserveArrivals.forEach((c, i) => checkFormation(`historical.reserveArrivals[${i}].formationId`, c.formationId));

  s.historical.objectives.forEach((o, i) => {
    if (!lineIds.has(o.lineId)) problems.push(`historical.objectives[${i}].lineId: unknown line "${o.lineId}"`);
    if (!sectorIds.has(o.sectorId)) problems.push(`historical.objectives[${i}].sectorId: unknown sector "${o.sectorId}"`);
  });

  if (s.terrainGrid && !sourceIds.has(s.terrainGrid.source.source)) {
    problems.push(`terrainGrid.source.source: unknown source "${s.terrainGrid.source.source}"`);
  }
  for (const r of collectSourceRefs(s, '')) {
    if (!sourceIds.has(r.id)) problems.push(`${r.path}: unknown source "${r.id}"`);
  }
  problems.push(...historicalTierRule(s));
  return problems.map((p) => locateProblem(p, locate));
}
