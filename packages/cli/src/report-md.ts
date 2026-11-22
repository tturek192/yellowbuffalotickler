import { casualtyPass, explain } from '@wwi/engine';
import type { BatchSummary, Cause, RunRecord, Side, SimEvent } from '@wwi/engine';
import { clock } from './format';
import { formatWhy } from './why';

/*
 * The model report (Task 19): a batch v2 summary set out as Markdown tables against the historical targets, with pass or
 * fail; the events of one run that mattered most and the causes behind them; the "why" chains of that run's first stalled
 * company and of each objective line it took outside its historical window; the defaults the run applied; and every
 * calibrated parameter with its starting value. The builder's commentary is hand-written into a marked block under
 * "Reading this report", which `sim report` carries over when it writes the file again (extractCommentary).
 * Nothing here changes a parameter or re-runs a statistic the batch already gives.
 */

/** The marked block that holds the hand-written commentary; `sim report` keeps what lies between the two markers. */
export const COMMENTARY_START = '<!-- builder-commentary:start: hand-written; `sim report` keeps this block when it writes the file again -->';
export const COMMENTARY_END = '<!-- builder-commentary:end -->';
const PLACEHOLDER = '\n_The builder\'s commentary is not written yet: write it here, between the markers, for each failing target._\n';

/** How deep the cause counts follow each event's refs (the same depth `explain` and `sim why` use). */
const CHAIN_DEPTH = 6;
/** The weight of one trench segment or objective line changing hands, in men, when events are ranked. */
const MEN_PER_CHANGE = 100;
/** The kinds that are ground changing hands. */
const CHANGES: ReadonlySet<SimEvent['kind']> = new Set(['segment-lost', 'segment-retaken', 'line-taken', 'line-lost']);
/** The longest why chain printed in full; a longer one is cut, with the command that prints it all. */
const CHAIN_LINES = 60;

/** The parameters a report reads: the model tables and the doctrines, as loaded. */
export type ReportParams = { tables?: unknown; doctrines?: Record<string, unknown> };

export type ReportOptions = {
  /** Wall time of the batch and the seed-1 run together, in milliseconds. */
  wallMs?: number;
  workers?: number;
  seedStart?: number;
  scenarioFile?: string;
  /** The attacking side, whose first pinned company is the first stalled one (default allied). */
  attacker?: Side;
  /** The hand-written commentary to keep (what lay between the markers), or none for the placeholder. */
  commentary?: string | null;
};

/** The hand-written commentary between the markers; null when the file has none. A file with broken markers is refused. */
export function extractCommentary(md: string): string | null {
  const count = (m: string) => md.split(m).length - 1;
  const s = count(COMMENTARY_START);
  const e = count(COMMENTARY_END);
  if (s === 0 && e === 0) return null;
  const start = md.indexOf(COMMENTARY_START);
  const end = md.indexOf(COMMENTARY_END);
  if (s !== 1 || e !== 1 || end < start) {
    throw new Error(`the builder commentary block is broken (${s} start and ${e} end markers): mend it by hand before the report is written again`);
  }
  return md.slice(start + COMMENTARY_START.length, end);
}

/** The men an event cost: killed and wounded on both sides by fire or a mine, and men captured by surrender or trapping. */
export function menLost(e: SimEvent): number {
  if (e.losses) return Object.values(e.losses).reduce((a, l) => a + (l?.killed ?? 0) + (l?.wounded ?? 0), 0);
  const f = e.factors ?? {};
  switch (e.kind) {
    case 'mine-fired':
      return f.menLost ?? 0;
    case 'defenders-trapped':
      return f.captured ?? 0;
    case 'company-surrendered':
      return f.men ?? 0;
    case 'dugout-cleared':
      return f.prisoners ?? 0;
    case 'bombardment-result':
      return f.losses ?? 0;
    default:
      return 0;
  }
}

/** The events an event's refs lead back to, itself first, each once, to `depth` levels. */
function ancestors(events: readonly SimEvent[], id: number, depth: number): number[] {
  const seen = new Set<number>([id]);
  let frontier = [id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) for (const r of events[i]?.refs ?? []) if (!seen.has(r)) (seen.add(r), next.push(r));
    frontier = next;
  }
  return [...seen];
}

export type Consequential = { event: SimEvent; men: number; changes: number; score: number };

/**
 * The `n` most consequential events: score = men lost (menLost) + MEN_PER_CHANGE × the segment and line changes
 * (segment-lost, segment-retaken, line-taken, line-lost) whose refs lead back to the event within CHAIN_DEPTH levels,
 * the change itself among them. Highest first, earlier event first on a tie; an event that scores 0 is left out.
 */
export function consequentialEvents(events: readonly SimEvent[], n = 50): Consequential[] {
  const changes = new Map<number, number>();
  for (const e of events) if (CHANGES.has(e.kind)) for (const a of ancestors(events, e.id, CHAIN_DEPTH)) changes.set(a, (changes.get(a) ?? 0) + 1);
  return events
    .map((event) => {
      const men = menLost(event);
      const c = changes.get(event.id) ?? 0;
      return { event, men, changes: c, score: men + MEN_PER_CHANGE * c };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.event.id - b.event.id)
    .slice(0, n);
}

export type CauseCount = { cause: Cause; chains: number; occurrences: number };

/** Causes over the why chains (`explain`, depth 6) of the given events: how many chains carry each, and how often in all. */
export function causeCounts(events: readonly SimEvent[], ids: readonly number[]): CauseCount[] {
  const counts = new Map<Cause, CauseCount>();
  for (const id of ids) {
    const inChain = new Set<Cause>();
    const visit = (w: ReturnType<typeof explain>) => {
      for (const c of w.event.causes) {
        const x = counts.get(c) ?? { cause: c, chains: 0, occurrences: 0 };
        x.occurrences++;
        counts.set(c, x);
        inChain.add(c);
      }
      w.because.forEach(visit);
    };
    visit(explain({ events: events as SimEvent[] }, { eventId: id }));
    for (const c of inChain) counts.get(c)!.chains++;
  }
  return [...counts.values()].sort((a, b) => b.chains - a.chains || b.occurrences - a.occurrences || a.cause.localeCompare(b.cause));
}

/** The attacker's first pinned company in the run: the first stalled one. */
export function firstStalledCompany(run: Pick<RunRecord, 'events' | 'units'>, attacker: Side = 'allied'): SimEvent | null {
  const side = new Map(run.units.map((u) => [u.id, u.side]));
  return run.events.find((e) => e.kind === 'company-pinned' && e.unitId !== undefined && side.get(e.unitId) === attacker) ?? null;
}

export type OffWindow = { lineId: string; sectorId: string; takenMin: number | null; earliest: number; latest: number };

/** Each objective line with a historical window that the run first took outside it, or never took, in the batch's order. */
export function linesOutsideWindow(batch: Pick<BatchSummary, 'lines'>, run: Pick<RunRecord, 'summary'>): OffWindow[] {
  const out: OffWindow[] = [];
  for (const l of batch.lines) {
    if (l.historicalEarliest === null || l.historicalLatest === null) continue;
    const t = run.summary.lineTaken.find((x) => x.lineId === l.lineId && x.sectorId === l.sectorId);
    const takenMin = t?.minute ?? null;
    if (takenMin === null || takenMin < l.historicalEarliest || takenMin > l.historicalLatest) {
      out.push({ lineId: l.lineId, sectorId: l.sectorId, takenMin, earliest: l.historicalEarliest, latest: l.historicalLatest });
    }
  }
  return out;
}

export type CalibratedParam = { path: string; value: number; description: string };

/** Every parameter marked `calibrated` in the tables and doctrines, with its starting value, sorted by path. */
export function calibratedParams(p: ReportParams): CalibratedParam[] {
  const out: CalibratedParam[] = [];
  const walk = (n: unknown, path: string) => {
    if (n === null || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o.value === 'number' && typeof o.description === 'string') {
      if (o.calibrated === true) out.push({ path, value: o.value, description: o.description });
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
  };
  walk(p.tables, 'tables');
  for (const [id, d] of Object.entries(p.doctrines ?? {})) walk(d, `doctrine.${id}`);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export type DefaultGroup = { pattern: string; count: number; example: string };

/** The defaults used, grouped by what was defaulted with the ids in brackets left out: most often first. */
export function groupDefaults(defaults: readonly string[]): DefaultGroup[] {
  const groups = new Map<string, DefaultGroup>();
  for (const d of defaults) {
    const arrow = d.indexOf(' ← ');
    const head = arrow < 0 ? d : d.slice(0, arrow);
    const pattern = head.replace(/\[[^\]]*\]/g, '[*]') + (arrow < 0 ? '' : d.slice(arrow));
    const g = groups.get(pattern);
    if (g) g.count++;
    else groups.set(pattern, { pattern, count: 1, example: d });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.pattern < b.pattern ? -1 : 1));
}

// ---- Markdown ---------------------------------------------------------------------------------------------------------

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const tableMd = (header: string[], rows: string[][]): string[] => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
];
const passCell = (p: boolean | null): string => (p === null ? 'no criterion' : p ? 'pass' : 'fail');
const n0 = (x: number): string => String(Math.round(x));
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const target = (t: number, r?: [number, number]): string => (r ? `${t} (${r[0]}–${r[1]})` : String(t));

/** A span of minutes as 'N min', 'H h M min' or 'D d H h'. */
function span(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

function wallText(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** A target's row: its label, pass, cells, and how the summary's list of failures names it (with its window where several share a label). */
type TargetRow = { label: string; pass: boolean | null; cells: string[]; listed?: string };

/**
 * Line pass rule (the report's; spec section 7 sets none for line times): taken in more than half the runs, and the
 * median first taking inside the historical window. Strict by design: the "off by" column shows how near a miss is.
 */
const linePass = (l: BatchSummary['lines'][number], runs: number): boolean | null =>
  l.historicalEarliest === null || l.historicalLatest === null
    ? null
    : l.takenIn > runs / 2 && l.median !== null && l.median >= l.historicalEarliest && l.median <= l.historicalLatest;

function offBy(med: number | null, e: number | null, l: number | null): string {
  if (e === null || l === null) return '—';
  if (med === null) return 'never taken';
  if (med < e) return `${span(e - med)} early`;
  if (med > l) return `${span(med - l)} late`;
  return 'in window';
}

export function reportToMarkdown(batch: BatchSummary, run: RunRecord, params: ReportParams, o: ReportOptions = {}): string {
  const z = run.zeroHour;
  const t = (m: number | null) => clock(z, m);
  const win = (a: number, b: number) => `${t(a)}–${t(b)}`;
  const lineName = (id: string) => run.geometry.lines.find((l) => l.id === id)?.name ?? id;
  const out: string[] = [];

  // Targets, each with a pass cell.
  const lineRows: TargetRow[] = batch.lines.map((l) => {
    const pass = linePass(l, batch.runs);
    const hist = l.historicalEarliest === null || l.historicalLatest === null ? '—' : win(l.historicalEarliest, l.historicalLatest);
    return {
      label: `${lineName(l.lineId)} (${l.lineId}), ${l.sectorId}`,
      pass,
      cells: [hist, `${l.takenIn}/${batch.runs}`, t(l.p10), t(l.median), t(l.p90), offBy(l.median, l.historicalEarliest, l.historicalLatest)],
    };
  });
  const casRows: TargetRow[] = batch.casualties.map((c) => ({
    label: `${c.side} casualties, ${c.formationId ?? 'all formations'}`,
    listed: `${c.side} casualties, ${c.formationId ?? 'all formations'}, ${win(c.from, c.to)}: median ${n0(c.median)} against ${target(c.target, c.range)}`,
    pass: c.pass,
    cells: [win(c.from, c.to), target(c.target, c.range), n0(c.p10), n0(c.median), n0(c.p90)],
  }));
  // Batch v2 reports prisoners and guns without a criterion; the report applies spec 7's count rule to them (casualtyPass).
  const countRows: TargetRow[] = [
    ...batch.prisoners.map((p) => ({
      label: `prisoners taken by ${p.bySide}`,
      listed: `prisoners taken by ${p.bySide}, ${win(p.from, p.to)}: median ${n0(p.median)} against ${target(p.target, p.range)}`,
      pass: casualtyPass({ value: p.target, ...(p.range ? { range: p.range } : {}) }, p),
      cells: [win(p.from, p.to), target(p.target, p.range), n0(p.p10), n0(p.median), n0(p.p90)],
    })),
    ...(batch.gunsCaptured
      ? [((g) => ({
          label: 'field guns captured',
          listed: `field guns captured, ${win(g.from, g.to)}: median ${n0(g.median)} against ${target(g.target, g.range)}`,
          pass: casualtyPass({ value: g.target, ...(g.range ? { range: g.range } : {}) }, g),
          cells: [win(g.from, g.to), target(g.target, g.range), n0(g.p10), n0(g.median), n0(g.p90)],
        }))(batch.gunsCaptured)]
      : []),
  ];
  const d = batch.duration;
  const w = batch.winner;
  const endRows: TargetRow[] = [
    {
      label: 'battle ends',
      pass: d.pass,
      cells: [d.target === null ? '—' : `${t(d.target)}${d.range ? ` (${win(d.range[0], d.range[1])})` : ''}`, `${t(d.p10)} / ${t(d.median)} / ${t(d.p90)} (p10 / median / p90)`],
    },
    {
      label: 'winner',
      pass: w.pass,
      cells: [w.historical ?? '—', `allied ${pct(w.allied)}, central ${pct(w.central)}, none ${pct(w.none)} of ${batch.runs} runs`],
    },
  ];
  const all = [...lineRows, ...casRows, ...countRows, ...endRows];
  const judged = all.filter((r) => r.pass !== null);
  const passed = judged.filter((r) => r.pass).length;

  out.push(
    `# Model report: ${run.scenarioTitle}`,
    '',
    'Generated by `sim report`, then annotated by hand: only the block under "Reading this report" is hand-written, and ' +
      '`sim report` keeps it when it writes this file again. Everything else is regenerated. No parameter was changed to make ' +
      'this report (Plan 3, "No tuning in this plan").',
    '',
    `- Scenario: ${o.scenarioFile ? `\`${o.scenarioFile}\`` : run.scenarioId} (status \`${run.scenarioStatus}\`), engine ${run.engineVersion}`,
    `- Batch: ${batch.runs} runs, seeds ${o.seedStart ?? 1}–${(o.seedStart ?? 1) + batch.runs - 1}${o.workers ? `, ${o.workers} workers` : ''}`,
    `- One run explained: seed ${run.seed}, ended ${t(run.summary.endedAt)} (${run.summary.endReason ?? '—'}), winner ${run.summary.winner ?? 'none'}`,
  );
  if (o.wallMs !== undefined) {
    const min = o.wallMs / 60_000;
    out.push(
      `- Wall time (batch and the seed-${run.seed} run): ${wallText(o.wallMs)}: ${min <= 5 ? 'within' : 'over'} the 5-minute target, ` +
        `${min <= 7 ? 'within' : 'over'} the interim 7-minute ceiling (the 5-minute target belongs to Plan 3 Task 21)`,
    );
  }
  out.push(
    '',
    '## Summary',
    '',
    `${passed} of ${judged.length} targets pass, ${judged.length - passed} fail${all.length > judged.length ? `; ${all.length - judged.length} have no criterion` : ''}.`,
    '',
    ...(judged.length > passed ? ['Failing:', '', ...judged.filter((r) => !r.pass).map((r) => `- ${r.listed ?? `${r.label}: ${r.cells.at(-1)}`}`), ''] : []),
    'Pass rules: casualties, prisoners and guns use spec section 7\'s count criterion (the historical figure inside the ' +
      'middle 80% of runs and the median within ±25% of it; for a disputed figure, the median inside its range). The battle\'s ' +
      'end is within ±1 day of the historical end (of its range when disputed). The historical winner must win more than half ' +
      'the runs. An objective line passes when it is taken in more than half the runs with the median first taking inside its ' +
      'historical window (the report\'s rule: spec section 7 gives none for line times).',
    '',
    '## Reading this report',
    '',
    // One string, so the block reads back exactly as it was given (extractCommentary).
    `${COMMENTARY_START}${o.commentary ?? PLACEHOLDER}${COMMENTARY_END}`,
    '',
    '## Targets',
    '',
    '### Objective lines (first taken)',
    '',
    ...tableMd(['Target', 'Historical', 'Taken in', 'p10', 'median', 'p90', 'Off by (median)', 'Pass'], lineRows.map((r) => [r.label, ...r.cells, passCell(r.pass)])),
    '',
  );
  if (casRows.length) {
    out.push('### Casualties', '', 'Killed, wounded and captured, in the window; a window that starts before Zero includes the bombardment.', '');
    out.push(...tableMd(['Target', 'Window', 'Historical', 'p10', 'median', 'p90', 'Pass'], casRows.map((r) => [r.label, ...r.cells, passCell(r.pass)])), '');
  }
  if (countRows.length) {
    out.push('### Prisoners and guns', '');
    out.push(...tableMd(['Target', 'Window', 'Historical', 'p10', 'median', 'p90', 'Pass'], countRows.map((r) => [r.label, ...r.cells, passCell(r.pass)])), '');
  }
  out.push('### Duration and winner', '');
  out.push(...tableMd(['Target', 'Historical', 'Model', 'Pass'], endRows.map((r) => [r.label, ...r.cells, passCell(r.pass)])), '');
  if (batch.keyGround?.length) {
    out.push(
      '### Key ground at the end',
      '',
      `Who held each piece of key ground when each run ended, as shares of the ${batch.runs} runs (not a target: the winner is the side holding most of it).`,
      '',
      ...tableMd(['Key ground', 'Allied', 'German', 'None'], batch.keyGround.map((k) => [`${k.name} (${k.id})`, pct(k.allied), pct(k.central), pct(k.none)])),
      '',
    );
  }

  // The events that mattered most, and their causes.
  const top = consequentialEvents(run.events, 50);
  const causes = causeCounts(run.events, top.map((x) => x.event.id)).slice(0, 10);
  out.push(
    `## Most consequential events (seed ${run.seed})`,
    '',
    `Score = men lost in the event (killed and wounded by its fire or mine, on both sides; men captured by its surrender, ` +
      `trapping or clearing; the garrison lost to a bombardment result) + ${MEN_PER_CHANGE} × the trench segments and objective lines ` +
      `changing hands (segment-lost, segment-retaken, line-taken, line-lost) whose refs lead back to it within ${CHAIN_DEPTH} levels, ` +
      'the change itself included. Batch extracts keep no events, so this reads the explained run only.',
    '',
    '**Caveat.** The ranking is lopsided. A ground change is credited to every event its refs lead back to, but men lost count only on the event itself. ' +
      'Bookkeeping events on the way to a taking (barrage lifts, companies reaching a line, orders) therefore rank high while losing no men, and the causes ' +
      'that sit on nearly every attacking chain (`timetable`, `followed-barrage`) top the cause counts without telling one event from another. ' +
      'Fire is logged per target company and per step, and direct-fire events carry no refs to their firers, so a single fire event seldom reaches ' +
      `${MEN_PER_CHANGE} men and no chain gathers a firer's losses together: fire losses are under-ranked here, however many men they cost in all. ` +
      'Grouping losses by firer needs firer ids on fire events (a Plan 4 item). Read this section as "what moved the ground", not "what cost the men".',
    '',
    `### The 10 most frequent causes on the ${top.length} most consequential events`,
    '',
    `Counted over each event's why chain to depth ${CHAIN_DEPTH} (as \`sim why\` shows it): "chains" is how many of the ${top.length} chains carry the cause, "occurrences" how many events in all of them do.`,
    '',
    ...tableMd(['Cause', 'Chains', 'Occurrences'], causes.map((c) => [c.cause, String(c.chains), String(c.occurrences)])),
    '',
    `### The ${top.length} events`,
    '',
    ...tableMd(
      ['Event', 'Time', 'Kind', 'Men lost', 'Changes', 'Score', 'What happened'],
      top.map((x) => [`#${x.event.id}`, t(x.event.minute), x.event.kind, String(x.men), String(x.changes), String(x.score), x.event.text]),
    ),
    '',
  );

  // One run explained.
  const chain = (id: number): string[] => {
    const lines = formatWhy(explain(run, { eventId: id }), z).split('\n');
    const cut = lines.length > CHAIN_LINES ? [...lines.slice(0, CHAIN_LINES), `… ${lines.length - CHAIN_LINES} more lines: sim why <record> --event ${id}`] : lines;
    return ['```text', ...cut, '```'];
  };
  out.push(
    `## Explain one run (seed ${run.seed})`,
    '',
    `The why chains (\`sim why\`, depth ${CHAIN_DEPTH}, each event once) of the ${o.attacker ?? 'allied'} side's first stalled ` +
      'company (its first company pinned) and of every objective line the run first took outside its historical window, or never took. ' +
      `A chain longer than ${CHAIN_LINES} lines is cut; the command at its end prints it all from the seed-${run.seed} record (\`sim run --seed ${run.seed}\`).`,
    '',
    '### The first stalled company',
    '',
  );
  const stalled = firstStalledCompany(run, o.attacker ?? 'allied');
  out.push(...(stalled ? chain(stalled.id) : ['No company of that side was pinned in this run.']), '');
  for (const l of linesOutsideWindow(batch, run)) {
    const head = `### ${lineName(l.lineId)}, ${l.sectorId}: ${l.takenMin === null ? 'never taken' : `taken ${t(l.takenMin)}`} (historical ${win(l.earliest, l.latest)})`;
    out.push(head, '');
    if (l.takenMin !== null) {
      const e = run.events.find((x) => x.kind === 'line-taken' && x.lineId === l.lineId && x.sectorId === l.sectorId);
      out.push(...(e ? chain(e.id) : ['The run records the taking but no line-taken event for it.']), '');
    } else {
      // Never taken: the last order that names the line (a headquarters committing troops to it as stalled), else the last event that names it.
      const named = run.events.filter((x) => x.lineId === l.lineId && (x.sectorId === undefined || x.sectorId === l.sectorId));
      const orders = named.filter((x) => x.kind === 'order-issued');
      const last = orders[orders.length - 1] ?? named[named.length - 1];
      const what = orders.length ? `The last of the ${orders.length} order(s) that commit troops to this line, and its chain:` : 'The last event that names this line, and its chain:';
      out.push(...(last ? [what, '', ...chain(last.id)] : ['No event in this run names this line.']), '');
    }
  }

  // Defaults and calibrated parameters.
  const groups = groupDefaults(run.defaultsUsed);
  out.push(
    '## Defaults used',
    '',
    `The seed-${run.seed} run applied ${run.defaultsUsed.length} defaults (\`record.defaultsUsed\`), grouped here by what was defaulted, with the ids in brackets as \`[*]\`.`,
    '',
    ...tableMd(['Default', 'Times', 'Example'], groups.map((g) => [`\`${g.pattern}\``, String(g.count), g.count > 1 ? `\`${g.example}\`` : '—'])),
    '',
  );
  const cal = calibratedParams(params);
  out.push(
    '## Calibrated parameters',
    '',
    `${cal.length} parameters are marked \`calibrated\` (fitted, not looked up). Each is at its documented starting value: Plan 4 calibrates them together, on shared parameters.`,
    '',
    ...tableMd(['Parameter', 'Starting value', 'Meaning'], cal.map((p) => [`\`${p.path}\``, String(p.value), p.description])),
    '',
  );
  return out.join('\n');
}
