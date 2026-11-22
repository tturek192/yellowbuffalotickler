import { StrictMode, useEffect, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { RunRecord } from '@wwi/engine';
import { fetchRun } from './ui/fetchRun';
import { Playback } from './ui/Playback';
import { RunPanel } from './ui/RunPanel';
import { parseRunRecord } from './ui/runRecord';
import { useMapStyle } from './ui/periodStyle';
// The period style's lettering, bundled (no runtime fetch): IM Fell English and its small capitals, and EB Garamond.
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/im-fell-english/latin-400-italic.css';
import '@fontsource/im-fell-english-sc/latin-400.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-600.css';
import './styles.css';

const DEFAULT_RUN = 'vimy';

type State = { kind: 'empty' } | { kind: 'loading'; name: string; fallback: boolean } | { kind: 'error'; message: string } | { kind: 'ready'; record: RunRecord };

function App() {
  const [mapStyle, setMapStyle] = useMapStyle();
  const [state, setState] = useState<State>(() => {
    const name = new URLSearchParams(window.location.search).get('run');
    // Without ?run= the app opens on the pre-computed Vimy run, so the page is useful before anyone presses Run.
    return { kind: 'loading', name: name ?? DEFAULT_RUN, fallback: !name };
  });

  useEffect(() => {
    if (state.kind !== 'loading') return;
    let live = true;
    fetchRun(state.name)
      .then((record) => live && setState({ kind: 'ready', record }))
      .catch((err: unknown) => live && setState(state.fallback ? { kind: 'empty' } : { kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [state]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      setState({ kind: 'ready', record: parseRunRecord(JSON.parse(await file.text())) });
    } catch (err) {
      setState({ kind: 'error', message: `${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const record = state.kind === 'ready' ? state.record : null;
  return (
    <div className={mapStyle === 'period' ? 'app is-period' : 'app'}>
      <header className="app-header">
        <div className="titles">
          <div className="eyebrow">WWI Battle Simulator · Time-lapse</div>
          <h1>{record ? record.scenarioTitle : 'No run loaded'}</h1>
        </div>
        <div className="header-actions">
          <label className="switch style-switch">
            <input type="checkbox" checked={mapStyle === 'period'} onChange={(e) => setMapStyle(e.currentTarget.checked ? 'period' : 'plain')} />
            <span className="switch-track" aria-hidden="true" />
            <span>Period style</span>
          </label>
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

      <RunPanel record={record} onRecord={(r) => setState({ kind: 'ready', record: r })} />
      {state.kind === 'ready' && <Playback record={state.record} mapStyle={mapStyle} />}
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
