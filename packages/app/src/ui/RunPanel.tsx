import { useEffect, useRef, useState } from 'react';
import type { RunRecord } from '@wwi/engine';
import { parseOverlay, ScenarioError, type Overlay } from '@wwi/scenario';
import { BatchCancelled } from '../sim/batch';
import { parseBundle } from '../sim/bundle';
import { createPool, type Pool } from '../sim/pool';
import { timeLabel } from '../playback';

export type BundleEntry = { id: string; file: string; title: string };
export type PresetEntry = { id: string; file: string; title: string; scenarioId: string };

/** The what-if presets that were written for this scenario (an overlay applied to another scenario fails). */
export const presetsFor = (index: PresetEntry[], scenarioId: string): PresetEntry[] => index.filter((p) => p.scenarioId === scenarioId);

const SIDES = { allied: 'Allied', central: 'German' } as const;
const REASONS = { 'objectives-held': 'objectives held', lull: 'a lull in the fighting', 'time-cap': 'the time limit' } as const;

/** The deadlock's closest margins, in plain words (the break's own when it broke, the run's closest otherwise). */
export function marginsLine(d: NonNullable<RunRecord['summary']['deadlock']>): string {
  const m = d.broken && d.atBreak ? d.atBreak : d.margins;
  const parts: string[] = [];
  const b = m.breakthrough.furthestBeyondM;
  if (b !== null) parts.push(`${Math.abs(Math.round(b))} m ${b >= 0 ? 'beyond' : 'short of'} the gun line`);
  parts.push(`${Math.round(m.surrender.capturedFrac * 100)}% of the defenders captured`);
  parts.push(`${Math.round(m.collapse.minFitFrac * 100)}% still fit`);
  if (m.stronghold.of > 0) parts.push(`${m.stronghold.held} of ${m.stronghold.of} strongholds held`);
  return parts.join(', ');
}

/** The one-line result: winner, end time and reason, and the deadlock (when the scenario is scored). */
export function resultLine(record: RunRecord): { text: string; margins: string | null } {
  const s = record.summary;
  const winner = s.winner ? `${SIDES[s.winner]} win` : 'No winner';
  const reason = s.endReason ? ` (${REASONS[s.endReason]})` : '';
  let text = `${winner}, ended ${timeLabel(record.zeroHour, s.endedAt, record.endMinute)}${reason}.`;
  const d = s.deadlock;
  if (!d) return { text, margins: null };
  text += d.broken ? ` Deadlock broken${d.by ? ` by ${d.by}` : ''}${d.minute !== undefined ? ` at ${timeLabel(record.zeroHour, d.minute, record.endMinute)}` : ''}.` : ' Deadlock held.';
  return { text, margins: `Closest: ${marginsLine(d)}.` };
}

const base = (): string => import.meta.env.BASE_URL;

async function getJson(path: string, what: string): Promise<unknown> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`Could not load ${what}.`);
  return res.json();
}

/** A failure in plain words. */
export function plainError(err: unknown): string {
  if (err instanceof ScenarioError) return `That battle or what-if is not valid: ${err.problems.slice(0, 3).join('; ')}`;
  return `The battle did not run: ${err instanceof Error ? err.message : String(err)}`;
}

type Phase = { kind: 'idle' } | { kind: 'running' } | { kind: 'error'; message: string };

/** "Run a battle": pick a battle and a what-if, give a seed, run it in a Web Worker and hand the record to the time-lapse. */
export function RunPanel({ record, onRecord }: { record: RunRecord | null; onRecord: (r: RunRecord) => void }) {
  const [bundles, setBundles] = useState<BundleEntry[]>([]);
  const [presets, setPresets] = useState<PresetEntry[]>([]);
  const [bundleId, setBundleId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [seed, setSeed] = useState('1');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const poolRef = useRef<Pool | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getJson('scenarios/index.json', 'the list of battles'), getJson('overlays/index.json', 'the list of what-ifs')])
      .then(([b, p]) => {
        if (!live) return;
        setBundles(b as BundleEntry[]);
        setPresets(p as PresetEntry[]);
        setBundleId((b as BundleEntry[])[0]?.id ?? '');
      })
      .catch((e: unknown) => live && setListError(plainError(e)));
    return () => {
      live = false;
      poolRef.current?.terminate();
    };
  }, []);

  const offered = presetsFor(presets, bundleId);
  const seedNum = Number(seed);
  const seedOk = seed.trim() !== '' && Number.isInteger(seedNum) && seedNum >= 0;
  const running = phase.kind === 'running';

  const run = async (): Promise<void> => {
    const entry = bundles.find((b) => b.id === bundleId);
    if (!entry || !seedOk) return;
    const preset = offered.find((p) => p.id === presetId);
    const pool = createPool();
    poolRef.current = pool;
    setPhase({ kind: 'running' });
    try {
      const bundle = parseBundle(await getJson(`scenarios/${entry.file}`, `the battle “${entry.title}”`));
      let overlay: Overlay | null = null;
      if (preset) {
        const res = await fetch(`${base()}overlays/${preset.file}`);
        if (!res.ok) throw new Error(`Could not load the what-if “${preset.title}”.`);
        overlay = parseOverlay(await res.text());
      }
      const rec = await pool.runOne(bundle, overlay, seedNum);
      if (poolRef.current !== pool) return;
      pool.terminate();
      setPhase({ kind: 'idle' });
      onRecord(rec);
    } catch (e) {
      if (poolRef.current !== pool) return;
      pool.terminate();
      setPhase(e instanceof BatchCancelled ? { kind: 'idle' } : { kind: 'error', message: plainError(e) });
    }
  };

  const cancel = (): void => {
    const pool = poolRef.current;
    poolRef.current = null;
    pool?.terminate();
    setPhase({ kind: 'idle' });
  };

  const result = record ? resultLine(record) : null;
  return (
    <section className="panel run-panel" aria-label="Run a battle">
      <form
        className="run-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running) void run();
        }}
      >
        <label>
          <span>Battle</span>
          <select value={bundleId} disabled={running} onChange={(e) => (setBundleId(e.currentTarget.value), setPresetId(''))}>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>What if</span>
          <select value={presetId} disabled={running} onChange={(e) => setPresetId(e.currentTarget.value)}>
            <option value="">None (as history)</option>
            {offered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Seed</span>
          <input type="number" min={0} step={1} value={seed} disabled={running} onChange={(e) => setSeed(e.currentTarget.value)} />
        </label>
        {running ? (
          <>
            <span className="run-status" role="status">
              Running…
            </span>
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button type="submit" className="btn run-btn" disabled={!bundleId || !seedOk}>
            Run
          </button>
        )}
      </form>
      {listError && (
        <p className="run-error" role="alert">
          {listError}
        </p>
      )}
      {phase.kind === 'error' && (
        <p className="run-error" role="alert">
          {phase.message}
        </p>
      )}
      {result && (
        <p className="run-result" data-testid="run-result">
          {result.text}
          {result.margins && <span className="run-margins"> {result.margins}</span>}
        </p>
      )}
    </section>
  );
}
