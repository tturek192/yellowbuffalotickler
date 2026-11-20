import { StrictMode, useEffect, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { RunRecord } from '@wwi/engine';
import { Playback } from './ui/Playback';
import './styles.css';

type State = { kind: 'empty' } | { kind: 'loading'; name: string } | { kind: 'error'; message: string } | { kind: 'ready'; record: RunRecord };

function asRunRecord(data: unknown): RunRecord {
  const r = data as Partial<RunRecord> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.snapshots) || r.snapshots.length === 0 || typeof r.endMinute !== 'number' || !r.geometry || !Array.isArray(r.events)) {
    throw new Error('This file is not a run record (expected snapshots, events, geometry and endMinute).');
  }
  return r as RunRecord;
}

function App() {
  const [state, setState] = useState<State>(() => {
    const name = new URLSearchParams(window.location.search).get('run');
    return name ? { kind: 'loading', name } : { kind: 'empty' };
  });

  useEffect(() => {
    if (state.kind !== 'loading') return;
    const { name } = state;
    if (!/^[\w.-]+$/.test(name)) {
      setState({ kind: 'error', message: `“${name}” is not a valid run name.` });
      return;
    }
    let live = true;
    fetch(`/runs/${encodeURIComponent(name)}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load /runs/${name}.json (HTTP ${res.status}).`);
        return res.json();
      })
      .then((data) => live && setState({ kind: 'ready', record: asRunRecord(data) }))
      .catch((err: unknown) => live && setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [state]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      setState({ kind: 'ready', record: asRunRecord(JSON.parse(await file.text())) });
    } catch (err) {
      setState({ kind: 'error', message: `${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const record = state.kind === 'ready' ? state.record : null;
  return (
    <div className="app">
      <header className="app-header">
        <div className="titles">
          <div className="eyebrow">WWI Battle Simulator · Time-lapse</div>
          <h1>{record ? record.scenarioTitle : 'No run loaded'}</h1>
        </div>
        <div className="header-actions">
          {record && (
            <dl className="run-meta">
              <div>
                <dt>Seed</dt>
                <dd>{record.seed}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>{record.engineVersion}</dd>
              </div>
            </dl>
          )}
          <label className="btn">
            <input type="file" accept=".json,application/json" onChange={onFile} />
            Load run…
          </label>
        </div>
      </header>

      {state.kind === 'ready' && <Playback record={state.record} />}
      {state.kind === 'loading' && <div className="panel notice">Loading run “{state.name}”…</div>}
      {state.kind === 'error' && (
        <div className="panel notice notice-error" role="alert">
          {state.message}
        </div>
      )}
      {state.kind === 'empty' && (
        <div className="panel notice">
          <p>Load a run record to play it back.</p>
          <p className="muted">
            Write one with <code>npm run sim -- run &lt;scenario.yaml&gt; --seed 1 --out packages/app/public/runs/&lt;name&gt;.json</code> and open{' '}
            <code>/?run=&lt;name&gt;</code>, or choose a file with “Load run…”.
          </p>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
