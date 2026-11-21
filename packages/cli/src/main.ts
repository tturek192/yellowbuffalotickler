import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { runBatch, runScenario } from '@wwi/engine';
import { buildReview, ScenarioError, v } from '@wwi/scenario';
import { loadScenario, loadTables } from '@wwi/scenario/node';
import { formatBatchV2 } from './format';
import { batchInWorkers } from './workers';
import { extractOpenQuestions, REVIEW_MARKER, reviewToMarkdown } from './review-md';

const USAGE = `usage:
  sim run <scenario.yaml> --seed <n> --out <file.json> [--doctrine-dir <dir>] [--tables-dir <dir>]
  sim batch <scenario.yaml> --runs <n> [--seed-start <n>] [--workers <n>] [--json] [--doctrine-dir <dir>] [--tables-dir <dir>]
  sim review <scenario.yaml> --out <file.md> [--notes <dir> ...] [--doctrine-dir <dir>] [--tables-dir <dir>]`;

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
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  const [command, file] = positionals;
  if ((command !== 'run' && command !== 'batch' && command !== 'review') || !file || positionals.length > 2) {
    throw new UsageError('expected a command and a scenario file');
  }
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
    runs = intOpt('runs', values.runs);
    if (runs < 1) throw new UsageError('--runs must be at least 1');
    seedStart = intOpt('seed-start', values['seed-start'], 1);
  }
  const workers = values.workers === undefined ? null : intOpt('workers', values.workers);
  if (workers !== null && workers < 1) throw new UsageError('--workers must be at least 1');
  const { scenario, doctrines } = loadScenario(file, values['doctrine-dir'] ?? 'doctrine');
  const tables = loadTables(values['tables-dir'] ?? 'tables');
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
  } else if (command === 'run') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(runScenario(scenario, { doctrines, tables }, { seed })));
  } else {
    const seeds = Array.from({ length: runs }, (_, i) => seedStart + i);
    // On worker threads with --workers (the same summary for any number of them), else in this process.
    const b =
      workers === null
        ? runBatch(scenario, { doctrines, tables }, seeds)
        : await batchInWorkers({ scenarioFile: resolve(file), doctrineDir: resolve(values['doctrine-dir'] ?? 'doctrine'), tablesDir: resolve(values['tables-dir'] ?? 'tables'), seeds, workers });
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
