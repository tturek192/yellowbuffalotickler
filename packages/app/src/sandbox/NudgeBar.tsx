import type { Order, OrderKind, Side } from '@wwi/sandbox';

export type Nudge = { kind: OrderKind; side: Side; unitId?: string } | null;
const LABEL: Record<OrderKind, string> = { 'send-reserve': 'Send reserve', barrage: 'Barrage', hold: 'Hold', 'pull-back': 'Pull back' };
const HINT: Record<OrderKind, string> = { 'send-reserve': 'tap one of your reserves, then where it should go', barrage: 'tap where the guns should fire', hold: 'tap the unit to hold', 'pull-back': 'tap the unit to pull back' };

/** The four orders. They take effect after a delay, shown as a clock on each pending order. */
export function NudgeBar({ sides, nudge, onNudge, pending, minute }: { sides: Side[]; nudge: Nudge; onNudge: (n: Nudge) => void; pending: Order[]; minute: number }) {
  if (!sides.length) return <p className="sb-row">Both sides are on the computer: watch.</p>;
  return (
    <div>
      <div className="sb-row" role="group" aria-label="Orders">
        {sides.length > 1 && sides.map(s => <button key={s} type="button" className={nudge?.side === s || (!nudge && s === sides[0]) ? 'sb-on' : ''} onClick={() => onNudge(nudge ? { ...nudge, side: s } : null)}>{s === 'attacker' ? 'Attacker' : 'Defender'}</button>)}
        {(Object.keys(LABEL) as OrderKind[]).map(k => (
          <button key={k} type="button" className={nudge?.kind === k ? 'sb-on' : ''} onClick={() => onNudge(nudge?.kind === k ? null : { kind: k, side: nudge?.side ?? sides[0] })}>{LABEL[k]}</button>
        ))}
        {nudge && <span>{nudge.unitId ? 'now tap where it should go' : HINT[nudge.kind]}</span>}
      </div>
      {pending.filter(o => sides.includes(o.side)).length > 0 && (
        <ul className="sb-row" aria-label="Orders on the way" style={{ listStyle: 'none', padding: 0 }}>
          {pending.filter(o => sides.includes(o.side)).map((o, i) => <li key={i}>{LABEL[o.kind]}{o.unitId ? ` (${o.unitId})` : ''}: <span className="sb-clock">⏱ {o.dueAt - minute} min</span></li>)}
        </ul>
      )}
    </div>
  );
}
