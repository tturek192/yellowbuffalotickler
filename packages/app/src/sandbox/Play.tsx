import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { advance, canBarrage, issue, startLive, type Live, type Setup, type Side } from '@wwi/sandbox';
import { drawSandbox, drawTerrain, fitView, toMetres, type HitBox } from './drawSandbox';
import { NudgeBar, type Nudge } from './NudgeBar';
import { clockText, minutesForFrame, resultText } from './playText';
import { editedMap } from './SetupEditor';

const SPEEDS = [0.5, 1, 4, 16];

export function Play({ setup, onBack, onReplay }: { setup: Setup; onBack: () => void; onReplay: (seed: number) => void }) {
  const [live, setLive] = useState<Live>(() => startLive(setup, setup.seed));
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [nudge, setNudge] = useState<Nudge>(null);
  const [nudgeSide, setNudgeSide] = useState<Side | null>(null);
  const [width, setWidth] = useState(800);
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), boxes = useRef<HitBox[]>([]);
  const acc = useRef(0);
  useEffect(() => { setLive(startLive(setup, setup.seed)); setPaused(false); setNudge(null); }, [setup]);

  const map = useMemo(() => editedMap(setup), [setup]);
  const view = useMemo(() => fitView(map, width), [map, width]);
  const terrain = useMemo(() => { const c = document.createElement('canvas'); c.width = view.w; c.height = view.h; drawTerrain(c.getContext('2d')!, view, map); return c; }, [map, view]);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(Math.max(300, Math.min(Math.floor(el.clientWidth), Math.round(window.innerHeight * 1.3))))); ro.observe(el); return () => ro.disconnect(); }, []);

  // The clock: whole game minutes each frame, by speed; nothing runs while paused or once the battle has ended.
  useEffect(() => {
    if (paused || live.outcome.ended) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      acc.current += minutesForFrame(now - last, speed); last = now;
      const n = Math.floor(acc.current); acc.current -= n;
      if (n > 0) setLive(l => { let x = l; for (let i = 0; i < n && !x.outcome.ended; i++) x = advance(x); return x; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, speed, live.outcome.ended]);

  useEffect(() => {
    const c = canvas.current; if (!c) return; const dpr = window.devicePixelRatio || 1; const b = live.battle;
    c.width = view.w * dpr; c.height = view.h * dpr; c.style.width = `${view.w}px`; c.style.height = `${view.h}px`;
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.drawImage(terrain, 0, 0);
    boxes.current = drawSandbox(ctx, view, { map, units: b.units, lines: b.lines, creepX: b.creepX, dir: b.dir, pointBarrages: b.pointBarrages, selected: nudge?.unitId, barrageDepthM: b.settings.barrageDepthM }).boxes;
  }, [live, view, terrain, map, nudge]);

  const humanSides = (['attacker', 'defender'] as const).filter(s => setup.controller[s] === 'human') as Side[];
  const onTap = (e: PointerEvent) => {
    if (!nudge || live.outcome.ended) return;
    const r = canvas.current!.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const at = toMetres(view, px, py);
    const hit = boxes.current.find(bx => px >= bx.x - 4 && px <= bx.x + bx.w + 4 && py >= bx.y - 4 && py <= bx.y + bx.h + 4);
    const unit = hit && live.battle.units.find(u => u.id === hit.id && u.side === nudge.side);
    const send = (o: Parameters<typeof issue>[1]) => { setLive(l => ({ ...l, battle: issue(l.battle, o) })); setNudge(null); };
    if (nudge.kind === 'barrage') return send({ side: nudge.side, kind: 'barrage', at: { x: Math.round(at.x), y: Math.round(at.y) } });
    if (nudge.kind === 'send-reserve') {
      if (!nudge.unitId) { if (unit && unit.status === 'waiting') setNudge({ ...nudge, unitId: unit.id }); return; }
      return send({ side: nudge.side, kind: 'send-reserve', unitId: nudge.unitId, at: { x: Math.round(at.x), y: Math.round(at.y) } });
    }
    if (unit) send({ side: nudge.side, kind: nudge.kind, unitId: unit.id });
  };

  const b = live.battle, ended = live.outcome.ended, res = ended ? resultText(live.outcome, b.settings.strongholdHoldMin) : null;
  return (
    <div className="sb-play">
      <div className="sb-row">
        <span className="sb-clock" aria-label="Battle clock">{clockText(b.minute)}</span>
        <button type="button" onClick={() => setPaused(!paused)} disabled={!!ended}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" onClick={() => setLive(l => advance(l))} disabled={!paused || !!ended}>Step 1 min</button>
        <span role="group" aria-label="Speed">{SPEEDS.map(s => <button key={s} type="button" className={speed === s ? 'sb-on' : ''} onClick={() => setSpeed(s)}>{s === 0.5 ? '½' : s}×</button>)}</span>
        <button type="button" onClick={onBack}>Back to setup</button>
      </div>
      {!ended && <NudgeBar sides={humanSides} side={nudgeSide ?? humanSides[0]} onSide={setNudgeSide} nudge={nudge} onNudge={setNudge} pending={b.pending} minute={b.minute} canBarrage={s => canBarrage(b, s)} />}
      {res && (
        <section className="sb-result" aria-label="Result">
          <h2 style={{ margin: '0 0 4px' }}>{res.headline}</h2><p style={{ margin: 0 }}>{res.detail}</p>
          <div className="sb-row">
            <button type="button" onClick={() => setLive(startLive(setup, setup.seed))}>Replay same seed</button>
            <button type="button" onClick={() => onReplay(setup.seed + 1)}>New seed</button>
            <button type="button" onClick={onBack}>Edit setup</button>
          </div>
        </section>
      )}
      <div ref={wrap} className="sb-map"><canvas ref={canvas} data-testid="sandbox-play" data-minute={b.minute} onPointerUp={onTap} style={{ touchAction: 'none' }} /></div>
      <ol className="sb-events" aria-label="What just happened" reversed>
        {b.events.slice(-5).reverse().map((e, i) => <li key={i}><span className="sb-clock">{clockText(e.minute)}</span> {e.unitId ? `${e.unitId}: ` : ''}{e.why}</li>)}
      </ol>
    </div>
  );
}
