import type { Scenario, Formation } from './schema';
import { historicalTierRule } from './sources';
import { parseLocalDateTime } from './local-time';
import { locateProblem } from './include';
import type { Tables } from './tables';

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
export function checkReferences(
  s: Scenario,
  doctrineIds: string[],
  locate: (path: string) => string = (p) => p,
  tables?: Pick<Tables, 'weapons'>,
): string[] {
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

  /** Weapon ids resolve only when the tables are at hand. */
  const checkWeapon = (path: string, id: string) => {
    if (tables && !Object.hasOwn(tables.weapons, id)) problems.push(`${path}: unknown weapon "${id}"`);
  };
  const checkFeature = (path: string, id: string) => {
    if (!featureKind.has(id)) problems.push(`${path}: unknown feature "${id}"`);
  };
  const checkLineSector = (path: string, p: { lineId: string; sectorId: string }) => {
    if (!lineIds.has(p.lineId)) problems.push(`${path}.lineId: unknown line "${p.lineId}"`);
    if (!sectorIds.has(p.sectorId)) problems.push(`${path}.sectorId: unknown sector "${p.sectorId}"`);
  };
  const checkBand = (path: string, b: { yMin: number; yMax: number }) => {
    if (b.yMin > b.yMax) problems.push(`${path}: yMin ${b.yMin} is above yMax ${b.yMax}`);
  };
  const artilleryIds = new Set(s.artillery.map((a) => a.id));
  /** bombardment, communications, operations, offMap, tanks and end: everything the model sections point at. */
  const checkModelSections = () => {
    s.bombardment?.allocations.forEach((a, i) => {
      if (!artilleryIds.has(a.artilleryId)) problems.push(`bombardment.allocations[${i}].artilleryId: unknown artillery "${a.artilleryId}"`);
    });
    s.bombardment?.spared.forEach((b, i) => {
      checkFeature(`bombardment.spared[${i}].featureId`, b.featureId);
      checkBand(`bombardment.spared[${i}]`, b);
    });
    s.bombardment?.wire.forEach((b, i) => {
      checkFeature(`bombardment.wire[${i}].featureId`, b.featureId);
      checkBand(`bombardment.wire[${i}]`, b);
    });
    s.communications?.liaison?.forEach((l, i) => checkFormation(`communications.liaison[${i}].formationId`, l.formationId));
    const dupOp = dupCheck();
    s.operations?.forEach((o, i) => {
      dupOp(`operations[${i}].id`, o.id);
      checkFormation(`operations[${i}].formationId`, o.formationId);
      if ('featureId' in o.target) checkFeature(`operations[${i}].target.featureId`, o.target.featureId);
      else checkLineSector(`operations[${i}].target`, o.target);
      if (o.prerequisite) checkLineSector(`operations[${i}].prerequisite`, o.prerequisite);
    });
    const dupFire = dupCheck();
    s.offMap?.fire.forEach((f, i) => {
      dupFire(`offMap.fire[${i}].id`, f.id);
      checkWeapon(`offMap.fire[${i}].weapon`, f.weapon);
      if ('featureId' in f.target) checkFeature(`offMap.fire[${i}].target.featureId`, f.target.featureId);
      else {
        checkBand(`offMap.fire[${i}].target`, f.target);
        if (f.target.xMin > f.target.xMax) problems.push(`offMap.fire[${i}].target: xMin ${f.target.xMin} is above xMax ${f.target.xMax}`);
      }
    });
    const dupAttack = dupCheck();
    s.offMap?.attacks.forEach((a, i) => {
      dupAttack(`offMap.attacks[${i}].id`, a.id);
      checkFeature(`offMap.attacks[${i}].targetFeatureId`, a.targetFeatureId);
    });
    const dupTank = dupCheck();
    s.tanks?.forEach((t, i) => {
      dupTank(`tanks[${i}].id`, t.id);
      if (!sectorIds.has(t.sectorId)) problems.push(`tanks[${i}].sectorId: unknown sector "${t.sectorId}"`);
      if (!lineIds.has(t.objectiveLineId)) problems.push(`tanks[${i}].objectiveLineId: unknown line "${t.objectiveLineId}"`);
      if (!Array.isArray(t.start)) problems.push(`tanks[${i}].start: lonLat needs the node loader (and a frame) to project it`);
    });
    const dupMine = dupCheck();
    s.mines?.forEach((x, i) => {
      dupMine(`mines[${i}].id`, x.id);
      if (!Array.isArray(x.at)) problems.push(`mines[${i}].at: lonLat needs the node loader (and a frame) to project it`);
    });
    const dupKey = dupCheck();
    s.end?.keyGround.forEach((k, i) => {
      dupKey(`end.keyGround[${i}].id`, k.id);
      checkFeature(`end.keyGround[${i}].featureId`, k.featureId);
    });
    const dl = s.deadlock;
    if (dl) {
      const line = dl.artilleryLine;
      if ('lineId' in line) {
        if (!lineIds.has(line.lineId)) problems.push(`deadlock.artilleryLine.lineId: unknown line "${line.lineId}"`);
      } else {
        const f = s.features.find((x) => x.id === line.featureId);
        if (!f) checkFeature('deadlock.artilleryLine.featureId', line.featureId);
        else if (f.geometry.type !== 'LineString' || !f.geometry.coordinates.every((p, j, ps) => j === 0 || p[1] > ps[j - 1]![1]))
          problems.push(`deadlock.artilleryLine.featureId: feature "${line.featureId}" must be a LineString with strictly ascending y (south to north)`);
      }
      dl.strongholds?.forEach((x, i) => checkFeature(`deadlock.strongholds[${i}].featureId`, x.featureId));
    }
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
    checkWeapon(`artillery[${i}].weapon`, a.weapon);
    if (a.position && !Array.isArray(a.position)) problems.push(`artillery[${i}].position: lonLat needs the node loader (and a frame) to project it`);
  });
  checkModelSections();
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
