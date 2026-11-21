import type { Scenario, Sources } from './schema';
import type { Doctrine } from './doctrine';
import type { Tables } from './tables';
import { TIERS, type Tier } from './sources';

export type ReviewRow = {
  path: string;
  label: string;
  value: string;
  kind: 'sourced' | 'estimate' | 'disputed';
  cite: string;
  note?: string;
  /** A model parameter's plain-language description (doctrine and tables rows). */
  description?: string;
};
export type ReviewSection = { title: string; rows: ReviewRow[] };
export type ReviewDoc = {
  scenarioTitle: string;
  status: string;
  counts: {
    values: number;
    sourced: number;
    estimates: number;
    disputed: number;
    /** Sourced values by the tier of their source; a disputed value counts once, under its best-tier source. */
    byTier: Record<Tier, number>;
  };
  sections: ReviewSection[];
  /** Left empty here: the CLI reads the research notes and passes the questions to the renderer. */
  openQuestions: string[];
};

type Registry = Record<string, { tier: Tier }>;
type Raw = Record<string, unknown>;
/** A row plus the tier it counts under (undefined for estimates). */
type Entry = { row: ReviewRow; tier?: Tier };

const isObj = (x: unknown): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x);
const isSourced = (x: unknown): x is Raw & { value: unknown } =>
  isObj(x) && 'value' in x && (typeof x.source === 'string' || typeof x.estimate === 'string' || Array.isArray(x.sources));

const show = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : JSON.stringify(x));

/** Keys that only structure the tree; they add nothing to a row's label. */
const STRUCTURAL = new Set(['forces', 'formations', 'children', 'companies', 'ratings', 'sectors', 'legs']);

/** A target window as `from–to`, so two windows with the same start can be told apart. */
const windowOf = (el: Raw): string | undefined =>
  isObj(el.window) && typeof el.window.from === 'string'
    ? `${el.window.from}${typeof el.window.to === 'string' ? `–${el.window.to}` : ''}`
    : undefined;

/** A readable name for an array element, from whichever identifying fields it has. */
function nameOf(el: unknown, i: number): string {
  if (!isObj(el)) return `#${i + 1}`;
  if (typeof el.name === 'string') return el.name;
  const window = windowOf(el);
  const parts = [el.id, el.lineId, el.sectorId, el.toLineId, el.at, el.bySide, el.side, el.formationId, window].filter(
    (p): p is string => typeof p === 'string',
  );
  return parts.length ? [...new Set(parts)].join(' ') : `#${i + 1}`;
}

function toEntry(node: Raw & { value: unknown }, path: string, names: string[], reg: Registry): Entry {
  const label = names.slice(-3).join(' / ');
  const tierOf = (id: unknown): Tier | undefined => (typeof id === 'string' ? reg[id]?.tier : undefined);
  const tag = (id: string, page?: unknown) => {
    const t = tierOf(id);
    return `${id}${typeof page === 'string' ? `, ${page}` : ''}${t ? ` (${t})` : ' (unregistered)'}`;
  };
  if (Array.isArray(node.sources)) {
    const sources = node.sources as Array<{ source: string; page?: string; note?: string }>;
    const range = node.range as unknown[];
    const best = sources.map((c) => tierOf(c.source)).filter((t): t is Tier => !!t).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0];
    return {
      tier: best,
      row: {
        path,
        label,
        value: `${show(node.value)} (range ${show(range[0])} to ${show(range[1])})`,
        kind: 'disputed',
        cite: sources.map((c) => tag(c.source, c.page)).join('; '),
        note: typeof node.note === 'string' ? node.note : undefined,
      },
    };
  }
  if (typeof node.estimate === 'string') {
    return { row: { path, label, value: show(node.value), kind: 'estimate', cite: 'estimate', note: node.estimate } };
  }
  return {
    tier: tierOf(node.source),
    row: {
      path,
      label,
      value: show(node.value),
      kind: 'sourced',
      cite: tag(node.source as string, node.page),
      note: typeof node.note === 'string' ? node.note : undefined,
    },
  };
}

/** Every Sourced or Disputed value under `node`, in file order. */
function collect(node: unknown, path: string, names: string[], reg: Registry, out: Entry[], skipName = false): void {
  if (isSourced(node)) {
    out.push(toEntry(node, path, names, reg));
  } else if (Array.isArray(node)) {
    node.forEach((el, i) => collect(el, `${path}[${i}]`, skipName ? names : [...names, nameOf(el, i)], reg, out));
  } else if (isObj(node)) {
    for (const [k, val] of Object.entries(node)) {
      const key = isObj(val) && windowOf(val) ? `${k} ${windowOf(val)}` : k;
      collect(val, `${path}.${k}`, STRUCTURAL.has(k) ? names : [...names, key], reg, out, k === 'forces');
    }
  }
}

const tiersOf = (s: Scenario, extra?: Doctrine): Registry => ({ ...(extra?.sources ?? {}), ...s.sources });

/** Estimates first, so the uncertain values come first; otherwise file order. */
const estimatesFirst = (entries: Entry[]): Entry[] => [
  ...entries.filter((e) => e.row.kind === 'estimate'),
  ...entries.filter((e) => e.row.kind !== 'estimate'),
];

const FIT_RMS = /fit rms ([\d.]+) ?m/;
const ACCURACY = /accuracy ±([\d.]+) ?m/;

/** One row per feature group (kind and side): how many features, how they are cited, the fit rms and accuracy. */
function geometryEntries(s: Scenario, reg: Registry): Entry[] {
  const out: Entry[] = [];
  collect(s.geometrySource, 'geometrySource', ['Geometry source (front and objective lines)'], reg, out);
  if (s.frame) collect(s.frame.bearingDeg, 'frame.bearingDeg', ['Attack bearing (frame)'], reg, out);
  if (s.terrainGrid) {
    const g = s.terrainGrid as unknown as { source: { source: string; page?: string; note?: string }; cols?: number; rows?: number; cellM?: number };
    const t = reg[g.source.source]?.tier;
    out.push({
      tier: t,
      row: {
        path: 'terrainGrid',
        label: 'Terrain grid',
        value: `${g.cols ?? '?'} x ${g.rows ?? '?'} cells of ${g.cellM ?? '?'} m`,
        kind: 'sourced',
        cite: `${g.source.source}${g.source.page ? `, ${g.source.page}` : ''}${t ? ` (${t})` : ''}`,
        note: g.source.note,
      },
    });
  }
  const groups = new Map<string, Scenario['features']>();
  for (const f of s.features) {
    const key = `${f.kind}${f.side ? ` (${f.side})` : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const [key, fs] of groups) {
    const methods = fs.map((f) => f.cite.value);
    const rms = [...new Set(methods.map((m) => FIT_RMS.exec(m)?.[1]).filter((x): x is string => !!x))];
    const acc = methods.map((m) => Number(ACCURACY.exec(m)?.[1])).filter((n) => Number.isFinite(n));
    const cites = fs.map((f) => f.cite as Raw & { value: unknown });
    const estimated = cites.some((c) => typeof c.estimate === 'string' && typeof c.source !== 'string');
    const sources = [...new Set(cites.filter((c) => typeof c.source === 'string').map((c) => c.source as string))];
    const best = sources.map((id) => reg[id]?.tier).filter((t): t is Tier => !!t).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0];
    const notes = [
      rms.length ? `fit rms ${rms.join(', ')} m` : undefined,
      acc.length ? `expected accuracy up to ±${Math.max(...acc)} m` : undefined,
      `${new Set(methods).size} distinct method note(s), e.g. "${methods[0]}"`,
    ].filter(Boolean);
    out.push({
      tier: estimated ? undefined : best,
      row: {
        path: `features[kind=${key}]`,
        label: key,
        value: `${fs.length} feature${fs.length === 1 ? '' : 's'}`,
        kind: estimated ? 'estimate' : 'sourced',
        cite: estimated && !sources.length ? 'estimate' : sources.map((id) => `${id} (${reg[id]?.tier ?? 'unregistered'})`).join('; '),
        note: notes.join('; '),
      },
    });
  }
  return out;
}

/** A calibrated coefficient is fitted in Plan 4, never looked up: its note says so first. */
const CALIBRATED = 'calibrated (Plan 4)';

/** Every Param under `node` (doctrine or tables), with its description, and calibrated ones marked. */
function paramEntries(node: unknown, path: string, names: string[], reg: Registry): Entry[] {
  const out: Entry[] = [];
  const walk = (n: unknown, p: string, ns: string[]) => {
    if (isSourced(n)) {
      const e = toEntry(n, p, ns, reg);
      const note = n.calibrated === true ? [CALIBRATED, e.row.note].filter(Boolean).join('. ') : e.row.note;
      out.push({ ...e, row: { ...e.row, note, description: typeof n.description === 'string' ? n.description : undefined } });
    } else if (isObj(n)) {
      for (const [k, v] of Object.entries(n)) walk(v, `${p}.${k}`, [...ns, k]);
    }
  };
  walk(node, path, names);
  return out;
}

/** The model tables, and the registry their citations resolve in. */
export type ReviewTables = Pick<Tables, 'weapons' | 'cover' | 'channels' | 'effects'> & { sources?: Sources };

export function buildReview(s: Scenario, doctrines: Record<string, Doctrine> = {}, tables?: ReviewTables): ReviewDoc {
  const reg = tiersOf(s);
  const walk = (node: unknown, path: string, root: string[] = [], r: Registry = reg): Entry[] => {
    const out: Entry[] = [];
    collect(node, path, root, r, out);
    return out;
  };
  const forcesOf = (side: Scenario['forces'][number]['side']): Entry[] =>
    s.forces.flatMap((f, i) => (f.side === side ? walk(f.formations, `forces[${i}].formations`) : []));

  const leaderEntries = walk(s.leaders, 'leaders').map((e) => ({
    ...e,
    row: { ...e.row, note: e.row.note ? `owner to confirm. ${e.row.note}` : 'owner to confirm' },
  }));
  const doctrineEntries = Object.entries(doctrines).flatMap(([id, d]) => {
    const r = tiersOf(s, d);
    return (['common', 'ncoPenalty', 'companyDefaults', 'attack', 'defence'] as const).flatMap((k) =>
      paramEntries(d[k], `doctrine.${id}.${k}`, [id, k], r),
    );
  });
  const tableReg: Registry = { ...s.sources, ...(tables?.sources ?? {}) };
  const tableEntries = tables
    ? (['weapons', 'cover', 'channels', 'effects'] as const).flatMap((k) => paramEntries(tables[k], `tables.${k}`, [k], tableReg))
    : [];

  const sectionEntries: Array<[string, Entry[]]> = [
    ['Historical targets', walk(s.historical, 'historical')],
    ['Leaders and ratings', leaderEntries],
    ['Canadian order of battle', forcesOf('allied')],
    ['German order of battle and garrisons', forcesOf('central')],
    ['Reserves', walk(s.reserves, 'reserves')],
    [
      'Fire plan and artillery',
      [
        ...walk(s.zeroHour, 'zeroHour', ['Zero hour']),
        ...walk(s.sectors, 'sectors'),
        ...walk(s.artillery, 'artillery'),
        ...walk(s.counterBattery, 'counterBattery', ['counterBattery']),
      ],
    ],
    ['Weather', walk(s.weather, 'weather')],
    ['Geometry', geometryEntries(s, reg)],
    ['Doctrine parameters', doctrineEntries],
    ['Model tables', tableEntries],
  ];

  const sections: ReviewSection[] = sectionEntries.map(([title, entries]) => ({
    title,
    rows: estimatesFirst(entries).map((e) => e.row),
  }));
  const all = sectionEntries.flatMap(([, e]) => e);
  const byTier = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  for (const e of all) if (e.tier) byTier[e.tier] += 1;
  const count = (k: ReviewRow['kind']) => all.filter((e) => e.row.kind === k).length;
  return {
    scenarioTitle: s.title,
    status: s.status,
    counts: { values: all.length, sourced: count('sourced'), estimates: count('estimate'), disputed: count('disputed'), byTier },
    sections,
    openQuestions: [],
  };
}
