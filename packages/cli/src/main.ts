import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { runBatch, runScenario } from '@wwi/engine';
import { ScenarioError, v } from '@wwi/scenario';
import { loadScenario } from '@wwi/scenario/node';
import { formatBatch } from './format';

const USAGE = `usage:
  sim run <scenario.yaml> --seed <n> --out <file.json> [--doctrine-dir <dir>]
  sim batch <scenario.yaml> --runs <n> [--seed-start <n>] [--doctrine-dir <dir>]`;

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

function main(argv: string[]): void {
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
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  const [command, file] = positionals;
  if ((command !== 'run' && command !== 'batch') || !file || positionals.length > 2) {
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
  } else {
    runs = intOpt('runs', values.runs);
    if (runs < 1) throw new UsageError('--runs must be at least 1');
    seedStart = intOpt('seed-start', values['seed-start'], 1);
  }
  const { scenario, doctrines } = loadScenario(file, values['doctrine-dir'] ?? 'doctrine');
  if (command === 'run') {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(runScenario(scenario, doctrines, { seed })));
  } else {
    const seeds = Array.from({ length: runs }, (_, i) => seedStart + i);
    console.log(formatBatch(runBatch(scenario, doctrines, seeds), v(scenario.zeroHour)));
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  if (e instanceof ScenarioError) {
    for (const p of e.problems) console.error(p);
    process.exit(2);
  }
  if (e instanceof UsageError) {
    console.error(`${e.message}\n${USAGE}`);
    process.exit(1);
  }
  throw e;
}
