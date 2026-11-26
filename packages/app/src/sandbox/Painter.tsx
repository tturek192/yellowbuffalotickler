import type { Terrain } from '@wwi/sandbox';

export type PaintTool = Terrain | 'raise' | 'lower';
const PAINTS: Array<[PaintTool, string]> = [['open', 'Open'], ['wood', 'Wood'], ['village', 'Village'], ['river', 'River'], ['road', 'Road'], ['raise', 'Raise'], ['lower', 'Lower']];

/** The terrain brushes. */
export function Painter({ value, onChange }: { value: PaintTool; onChange: (t: PaintTool) => void }) {
  return (
    <div className="sb-row" role="group" aria-label="Terrain brush">
      {PAINTS.map(([t, label]) => (
        <button key={t} type="button" className={value === t ? 'sb-on' : ''} onClick={() => onChange(t)}>{label}</button>
      ))}
    </div>
  );
}
