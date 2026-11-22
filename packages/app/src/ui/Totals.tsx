import { memo } from 'react';
import type { Side } from '@wwi/engine';
import type { Totals as TotalsAt } from '../playback';

const SIDE_NAME: Record<Side, string> = { allied: 'Allied', central: 'German' };
const n = (v: number): string => Math.round(v).toLocaleString('en-GB');

/**
 * Running totals at the playhead (spec 9.2, "alongside the map"): each side's casualties since Zero, killed, wounded and
 * taken prisoner, the prisoners each side has taken, and the guns captured. The figures come from `totalsAt`.
 */
export const Totals = memo(function Totals({ totals }: { totals: TotalsAt }) {
  const sides: Side[] = ['allied', 'central'];
  const rows: Array<[string, (s: Side) => number]> = [
    ['Killed', (s) => totals.casualties[s].killed],
    ['Wounded', (s) => totals.casualties[s].wounded],
    ['Captured', (s) => totals.casualties[s].captured],
  ];
  return (
    <section className="panel totals" aria-labelledby="totals-title" data-testid="totals">
      <h2 id="totals-title" className="panel-title">
        Running totals <span className="totals-since">since Zero</span>
      </h2>
      <table className="totals-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Casualties</span>
            </th>
            {sides.map((s) => (
              <th key={s} scope="col" className={`side-${s}`}>
                {SIDE_NAME[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, of]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {sides.map((s) => (
                <td key={s} data-testid={`totals-${label.toLowerCase()}-${s}`}>
                  {n(of(s))}
                </td>
              ))}
            </tr>
          ))}
          <tr className="totals-sum">
            <th scope="row">Casualties</th>
            {sides.map((s) => (
              <td key={s} data-testid={`totals-casualties-${s}`}>
                {n(totals.casualties[s].killed + totals.casualties[s].wounded + totals.casualties[s].captured)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <dl className="totals-taken">
        <div>
          <dt>Prisoners taken</dt>
          <dd>
            {sides.map((s) => (
              <span key={s} className={`side-${s}`} data-testid={`totals-prisoners-${s}`}>
                {SIDE_NAME[s]} {n(totals.prisoners[s])}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Guns captured</dt>
          <dd data-testid="totals-guns">{n(totals.guns)}</dd>
        </div>
      </dl>
    </section>
  );
});
