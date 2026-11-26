import type { Setup } from '@wwi/sandbox';
// Replaced in Task 7 (play, nudges and result).
export function Play({ onBack }: { setup: Setup; onBack: () => void; onReplay: (seed: number) => void }) {
  return <div className="sb-play"><button type="button" onClick={onBack}>Back to setup</button></div>;
}
