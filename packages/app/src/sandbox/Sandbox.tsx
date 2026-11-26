import { useState } from 'react';
import { decodeSetup, defaultSetup, type Setup } from '@wwi/sandbox';
import { SetupEditor } from './SetupEditor';
import { Play } from './Play';

/** Reads ?s= once: a shared setup, or the ridge's default. */
function initial(): { setup: Setup; notice?: string } {
  const s = new URLSearchParams(location.search).get('s');
  if (s) { const r = decodeSetup(s); if (r.setup) return { setup: r.setup, notice: r.notice }; return { setup: defaultSetup('ridge'), notice: r.notice }; }
  return { setup: defaultSetup('ridge') };
}

export function Sandbox() {
  const [{ setup, notice }, set] = useState(initial);
  const [mode, setMode] = useState<'setup' | 'play'>('setup');
  return (
    <main className="sb">
      <header className="sb-head"><h1>Deadlock 1916</h1><p>Set up a front, press Go, nudge the battle, and see whether the deadlock breaks.</p></header>
      {mode === 'setup'
        ? <SetupEditor setup={setup} notice={notice} onChange={s => set({ setup: s })} onGo={() => setMode('play')} />
        : <Play setup={setup} onBack={() => setMode('setup')} onReplay={seed => set({ setup: { ...setup, seed } })} />}
    </main>
  );
}
