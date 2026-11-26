import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { MAPS, mapById, defaultSetup, encodeSetup, validateSetup, startBattle, SETTINGS, type Setup, type Side, type Cell } from '@wwi/sandbox';
import { drawSandbox, drawTerrain, fitView, toMetres, type HitBox } from './drawSandbox';
import { Painter, type PaintTool } from './Painter';

type Tool = 'battalion' | 'battery' | 'reserve' | 'trench' | 'wire' | 'erase' | 'paint';
const ADVANCED: Array<[keyof typeof SETTINGS, string, number, number, number]> = [
  ['mgLethality', 'Machine-gun deadliness', 0.001, 0.008, 0.0005], ['barrageSpeedMPerMin', 'Barrage speed (m/min)', 10, 80, 5],
  ['orderDelayMin', 'Order delay (min)', 0, 60, 5], ['emergeMin', 'Minutes to man the parapet', 1, 10, 1],
  ['advanceMPerMin', 'Infantry speed (m/min)', 20, 80, 5], ['sealDistanceM', 'Reserve seals within (m)', 200, 2000, 50],
];

/** Applies the setup's terrain edits to its map. */
export function editedMap(s: Setup) {
  const m = mapById(s.mapId)!; if (!s.mapEdits?.length) return m;
  const cells = m.cells.slice(); for (const [i, c] of s.mapEdits) cells[i] = c; return { ...m, cells };
}
/** Mirrors every unit and line across the map and hands the attack to the other edge. */
export function swapEdges(s: Setup): Setup {
  const W = mapById(s.mapId)!.w * 100;
  return { ...s, attackerEdge: s.attackerEdge === 'west' ? 'east' : 'west', units: s.units.map(u => ({ ...u, x: W - u.x })), lines: s.lines.map(l => ({ ...l, points: l.points.map(([x, y]) => [W - x, y] as [number, number]) })) };
}

/** Screen position of a river cell in the middle row, for tests ("" when the map has none). */
function riverPx(m: ReturnType<typeof editedMap>, v: { scale: number }): string {
  const mid = Math.floor(m.h / 2) * m.w; const j = m.cells.slice(mid).findIndex(c => c.t === 'river'); if (j < 0) return ''; const i = mid + j;
  return `${((i % m.w) * 100 + 50) * v.scale},${(Math.floor(i / m.w) * 100 + 50) * v.scale}`;
}

export function SetupEditor({ setup, onChange, onGo, notice }: { setup: Setup; onChange: (s: Setup) => void; onGo: () => void; notice?: string }) {
  const [tool, setTool] = useState<Tool>('battalion');
  const [side, setSide] = useState<Side>('attacker');
  const [paint, setPaint] = useState<PaintTool>('wood');
  const [msg, setMsg] = useState<{ text: string; x: number; y: number } | null>(null);
  const [lineStart, setLineStart] = useState<[number, number] | null>(null);
  const [share, setShare] = useState('');
  const [showAdv, setShowAdv] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), boxes = useRef<HitBox[]>([]);
  const [width, setWidth] = useState(800);
  const map = useMemo(() => editedMap(setup), [setup]);
  const view = useMemo(() => fitView(map, width), [map, width]);
  const preview = useMemo(() => startBattle(setup, setup.seed), [setup]);
  const terrain = useMemo(() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = view.w; c.height = view.h; drawTerrain(c.getContext('2d')!, view, map); return c; }, [map, view]);

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(Math.max(300, Math.floor(el.clientWidth)))); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => {
    const c = canvas.current; if (!c || !terrain) return; const dpr = window.devicePixelRatio || 1;
    c.width = view.w * dpr; c.height = view.h * dpr; c.style.width = `${view.w}px`; c.style.height = `${view.h}px`;
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.drawImage(terrain, 0, 0);
    boxes.current = drawSandbox(ctx, view, { map, units: preview.units, lines: preview.lines, creepX: null, dir: preview.dir, pointBarrages: [] }).boxes;
  }, [terrain, view, map, preview]);

  const at = (e: PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  const hitUnit = (px: number, py: number) => boxes.current.find(b => px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4);
  const remove = (px: number, py: number) => { const h = hitUnit(px, py); if (h) onChange({ ...setup, units: setup.units.filter(u => u.id !== h.id) }); return !!h; };
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = (p: string) => { let i = 1; while (setup.units.some(u => u.id === `${p}${i}`)) i++; return `${p}${i}`; };

  const onDown = (e: PointerEvent) => {
    const { px, py } = at(e); const m = toMetres(view, px, py); setMsg(null);
    if (e.button === 2) { remove(px, py); return; }
    press.current = setTimeout(() => { press.current = null; remove(px, py); }, 500);
    (e.currentTarget as HTMLElement).dataset.down = `${px},${py},${m.x},${m.y}`;
  };
  const onUp = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement; const d = el.dataset.down; delete el.dataset.down;
    if (!d || press.current === null) return; clearTimeout(press.current); press.current = null;
    const [px, py, x, y] = d.split(',').map(Number);
    if (tool === 'erase') { if (!remove(px, py)) onChange({ ...setup, lines: setup.lines.filter(l => !l.points.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 300)) }); return; }
    if (tool === 'paint') {
      const i = Math.floor(y / 100) * map.w + Math.floor(x / 100); const cur = map.cells[i]; if (!cur) return;
      const next: Cell = paint === 'raise' ? { ...cur, h: cur.h + 10 } : paint === 'lower' ? { ...cur, h: Math.max(0, cur.h - 10) } : { ...cur, t: paint };
      onChange({ ...setup, mapEdits: [...(setup.mapEdits ?? []).filter(([j]) => j !== i), [i, next]] }); return;
    }
    if (tool === 'trench' || tool === 'wire') {
      if (!lineStart) { setLineStart([x, y]); setMsg({ text: 'Tap the other end of the line', x: px, y: py }); return; }
      onChange({ ...setup, lines: [...setup.lines, { kind: tool, side, points: [lineStart, [x, y]], ...(tool === 'wire' ? { cut: 0 } : {}) }] }); setLineStart(null); return;
    }
    const u = { id: nextId(side === 'attacker' ? (tool === 'battery' ? 'ag' : 'a') : tool === 'battery' ? 'dg' : 'd'), side, kind: tool === 'battery' ? 'battery' as const : 'battalion' as const, x: Math.round(x), y: Math.round(y), men: tool === 'battery' ? 150 : 800, reserve: tool === 'reserve' };
    const problems = validateSetup({ ...setup, units: [...setup.units, u] }, map).filter(p => p.startsWith(u.id) || p.startsWith('too many'));
    if (problems.length) { setMsg({ text: problems[0].replace(u.id, 'That unit'), x: px, y: py }); return; }
    onChange({ ...setup, units: [...setup.units, u] });
  };

  const doShare = () => { const url = `${location.origin}${location.pathname}?s=${encodeSetup(setup)}`; setShare(url); navigator.clipboard?.writeText(url).catch(() => {}); };
  const TOOLS: Array<[Tool, string]> = [['battalion', 'Battalion'], ['battery', 'Battery'], ['reserve', 'Reserve'], ['trench', 'Trench'], ['wire', 'Wire'], ['erase', 'Eraser'], ['paint', 'Paint terrain']];
  return (
    <div className="sb-setup">
      {notice && <p className="sb-notice" role="status">{notice}</p>}
      <div className="sb-row">
        <label>Map <select value={setup.mapId} onChange={e => onChange({ ...defaultSetup(e.target.value), controller: setup.controller })} aria-label="Map">
          {MAPS.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        <button type="button" onClick={() => onChange({ ...defaultSetup(setup.mapId), controller: setup.controller })}>Load default setup</button>
        <button type="button" onClick={() => onChange({ ...setup, units: [], lines: [] })}>Clear</button>
        <button type="button" onClick={() => onChange(swapEdges(setup))}>Swap attacker</button>
      </div>
      <div className="sb-row" role="group" aria-label="Tool">
        <span className="sb-side">
          {(['attacker', 'defender'] as const).map(s => <button key={s} type="button" className={side === s ? 'sb-on' : ''} onClick={() => setSide(s)}>{s === 'attacker' ? 'Attacker' : 'Defender'}</button>)}
        </span>
        {TOOLS.map(([t, label]) => <button key={t} type="button" className={tool === t ? 'sb-on' : ''} onClick={() => { setTool(t); setLineStart(null); }}>{label}</button>)}
      </div>
      {tool === 'paint' && <Painter value={paint} onChange={setPaint} />}
      <div ref={wrap} className="sb-map">
        <canvas ref={canvas} data-testid="sandbox-map" data-units={setup.units.length} data-river={riverPx(map, view)} onPointerDown={onDown} onPointerUp={onUp} onContextMenu={e => e.preventDefault()} style={{ touchAction: 'none' }} />
        {msg && <div className="sb-msg" role="alert" style={{ left: msg.x + 8, top: msg.y + 8 }}>{msg.text}</div>}
      </div>
      <div className="sb-row">
        {(['attacker', 'defender'] as const).map(s => (
          <label key={s}>{s === 'attacker' ? 'Attacker' : 'Defender'}: <select aria-label={`${s} played by`} value={setup.controller[s]} onChange={e => onChange({ ...setup, controller: { ...setup.controller, [s]: e.target.value as 'human' | 'computer' } })}>
            <option value="human">You</option><option value="computer">Computer</option></select></label>
        ))}
        <label>Seed <input type="number" value={setup.seed} min={1} onChange={e => onChange({ ...setup, seed: Math.max(1, Number(e.target.value) || 1) })} style={{ width: '5em' }} /></label>
        <button type="button" onClick={() => setShowAdv(!showAdv)} aria-expanded={showAdv}>Advanced</button>
        <button type="button" onClick={doShare}>Share link</button>
        <button type="button" className="sb-go" onClick={onGo}>Go</button>
      </div>
      {share && <input className="sb-share" readOnly value={share} aria-label="Share link" onFocus={e => e.currentTarget.select()} />}
      {showAdv && (
        <div className="sb-adv">
          {ADVANCED.map(([k, label, min, max, st]) => (
            <label key={k}>{label}: <b>{setup.settings?.[k] ?? SETTINGS[k]}</b>
              <input type="range" min={min} max={max} step={st} value={setup.settings?.[k] ?? SETTINGS[k]} onChange={e => onChange({ ...setup, settings: { ...setup.settings, [k]: Number(e.target.value) } })} /></label>
          ))}
        </div>
      )}
    </div>
  );
}
