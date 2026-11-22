import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { explain, runBatch, runScenario } from '@wwi/engine';
import type { RunRecord } from '@wwi/engine';
import { buildReview, ScenarioError, v } from '@wwi/scenario';
import { formatBatchV2 } from './format';
import { atMinute, formatWhy } from './why';
import { batchInWorkers, loadFiles, type Files } from './workers';
import { extractOpenQuestions, REVIEW_MARKER, reviewToMarkdown } from './review-md';
import { extractCommentary, reportToMarkdown } from './report-md';

const USAGE = `usage:
  sim run <scenario.yaml> --seed <n> --out <file.json> [--overlay <file> [--drop-unresolved]] [--doctrine-dir <dir>] [--tables-dir <dir>]
  sim batch <scenario.yaml> --runs <n> [--seed-start <n>] [--workers <n>] [--json] [--overlay <file> [--drop-unresolved]] [--doctrine-dir <dir>] [--tables-dir <dir>]
  sim why <record.json> (--event <n> | --unit <id> --at <HH:MM>)
  sim review <scenario.yaml> --out <file.md> [--notes <dir> ...] [--overlay <file> [--drop-unresolved]] [--doctrine-dir <dir>] [--tables-dir <dir>]
  sim report <scenario.yaml> --runs <n> --out <file.md> [--seed-start <n>] [--workers <n>] [--overlay <file> [--drop-unresolved]] [--doctrine-dir <dir>] [--tables-dir <dir>]

  --overlay <file>     run a what-if: apply the overlay (overlays/README.md) to the scenario; the record lists its changes (whatIf)
  --drop-unresolved    leave out the overlay's ops that no longer resolve against the scenario (otherwise they stop the run, exit 2)`;

class UsageError extends Error {}

function intOpt(name: string, value: string | undefined, fallback?: number): number {
  if (value === undefined) {
    if (fallback === undefined) throw new UsageError(`missing --${name}`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw new UsageError(`--${name} must be an integer`);
  return n;
}

async function main(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        seed: { type: 'string' },
        out: { type: 'string' },
        runs: { type: 'string' },
        'seed-start': { type: 'string' },
        'doctrine-dir': { type: 'string' },
        notes: { type: 'string', multiple: true },
        'tables-dir': { type: 'string' },
        workers: { type: 'string' },
        json: { type: 'boolean' },
        event: { type: 'string' },
        unit: { type: 'string' },
        at: { type: 'string' },
        overlay: { type: 'string' },
        'drop-unresolved': { type: 'boolean' },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  const [command, file] = positionals;
  if (command === 'why') {
    if (!file || positionals.length > 2) throw new UsageError('expected a record file');
    const record = JSON.parse(readFileSync(file, 'utf8')) as RunRecord;
    if (values.event !== undefined) {
      console.log(formatWhy(explain(record, { eventId: intOpt('event', values.event) }), record.zeroHour));
    } else if (values.unit !== undefined && values.at !== undefined) {
      console.log(formatWhy(explain(record, { unitId: values.unit, minute: atMinute(record.zeroHour, values.at, record.endMinute) }), record.zeroHour));
    } else {
      throw new UsageError('expected --event <n> or --unit <id> --at <HH:MM>');
    }
    return;
  }
  if ((command !== 'run' && command !== 'batch' && command !== 'review' && command !== 'report') || !file || positionals.length > 2) {
    throw new UsageError('expected a command and a scenario file');
  }
  if (values['drop-unresolved'] && values.overlay === undefined) throw new UsageError('--drop-unresolved needs --overlay');
  let seed = 0;
  let out = '';
  let runs = 0;
  let seedStart = 0;
  if (command === 'run') {
    seed = intOpt('seed', values.seed);
    if (!values.out) throw new UsageError('missing --out');
    out = values.out;
  } else if (command === 'review') {
    if (!values.out) throw new UsageError('missing --out');
    out = values.out;
  } else {
    if (command === 'report') {
      if (!values.out) throw new UsageError('missing --out');
      out = values.out;
    }
    runs = intOpt('runs', values.runs);
    if (runs < 1) throw new UsageError('--runs must be at least 1');
    seedStart = intOpt('seed-start', values['seed-start'], 1);
  }
  const workers = values.workers === undefined ? null : intOpt('workers', values.workers);
  if (workers !== null && workers < 1) throw new UsageError('--workers must be at least 1');
  // The files a worker loads too (as absolute paths, workers.ts): the scenario's, and the overlay's (each worker applies it as it loads).
  const files: Files = {
    scenarioFile: file,
    doctrineDir: values['doctrine-dir'] ?? 'doctrine',
    tablesDir: values['tables-dir'] ?? 'tables',
    ...(values.overlay !== undefined ? { overlayFile: values.overlay } : {}),
    ...(values['drop-unresolved'] ? { dropUnresolved: true } : {}),
  };
  // The tables first (the scenario's weapon ids are checked against them as it loads), then the overlay, if any.
  const { scenario, models, whatIf, dropped } = loadFiles(files);
  const { doctrines, tables } = models;
  for (const u of dropped) console.error(`dropped ops[${u.index}] (${u.op.op}): ${u.reason}`);
  const runOpts = whatIf ? { whatIf } : {};
  if (command === 'review') {
    // Each --notes directory's research notes, in the order given; a question is labelled with its directory and file.
    const questions = (values.notes ?? []).flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const)
        .filter(([, text]) => !text.includes(REVIEW_MARKER)) // a generated review is not a research note
        .flatMap(([f, text]) => extractOpenQuestions(text, `${basename(dir)}/${f}`)),
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, reviewToMarkdown(buildReview(scenario, doctrines, tables), questions));
  } else if (command === 'report') {
    // The hand-written commentary of an earlier report at --out is read first (a broken block stops here, before anything
    // is run or written) and carried into the new one.
    const commentary = existsSync(out) ? extractCommentary(readFileSync(out, 'utf8')) : null;
    // An existing file with no commentary block may hold hand-written text all the same: never overwrite it.
    if (existsSync(out) && commentary === null) throw new Error(`${out} exists and has no builder commentary block: move it away, or add the markers, before the report is written`);
    const seeds = Array.from({ length: runs }, (_, i) => seedStart + i);
    const started = performance.now();
    const b = await batchInWorkers({ ...files, seeds, workers: workers ?? 1 });
    const record = runScenario(scenario, models, { seed: seedStart, ...runOpts });
    const wallMs = performance.now() - started;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, reportToMarkdown(b, record, { tables, doctrines }, { wallMs, workers: workers ?? 1, seedStart, scenarioFile: file, commentary }));
    console.log(`report written to ${out}: ${runs} runs in ${(wallMs / 1000).toFixed(1)} s`);
  } else if (command === 'run') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(runScenario(scenario, models, { seed, ...runOpts })));
  } else {
    const seeds = Array.from({ length: runs }, (_, i) => seedStart + i);
    // On worker threads with --workers (the same summary for any number of them), else in this process.
    const b =
      workers === null
        ? runBatch(scenario, models, seeds)
        : await batchInWorkers({ ...files, seeds, workers });
    console.log(values.json ? JSON.stringify(b, null, 2) : formatBatchV2(b, v(scenario.zeroHour)));
  }
}

try {
  await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof ScenarioError) {
    for (const p of e.problems) console.error(p);
    process.exit(2);
  }
  if (e instanceof UsageError) {
    console.error(`${e.message}\n${USAGE}`);
    process.exit(1);
  }
  // Anything else is a bug or an I/O failure: say what went wrong in one line, without the stack.
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`.split('\n')[0]);
  process.exit(3);
}
