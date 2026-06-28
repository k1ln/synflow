import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import type { Instrument } from '../model/project';
import { Knob } from './Knob';

const WAVES = ['sine', 'saw', 'square', 'tri', 'noise'];

function Scope({ color }: { color: string }) {
  const [ph, setPh] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => { setPh((p) => p + 0.13); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  let d = 'M 0 30';
  for (let x = 0; x <= 320; x += 4) {
    const y = 30 + Math.sin(x * 0.06 + ph) * 14 * (0.6 + 0.4 * Math.sin(x * 0.013 + ph * 0.5));
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return (
    <div className="pp-scope">
      <svg width="100%" height="60" viewBox="0 0 320 60" preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      </svg>
    </div>
  );
}

export function PluginPanel({ instrument, onClose, onParam, onEdit }: {
  instrument: Instrument;
  onClose: () => void;
  /** role -> 0..1 value; the app maps the role to a real engine param. */
  onParam?: (role: string, value: number) => void;
  /** Open this instrument's flow in the synflow editor. */
  onEdit?: () => void;
}) {
  const cat = 'var(--cat-source)';
  const [wave, setWave] = useState('saw');
  const P = (role: string) => (v: number) => onParam?.(role, v);
  const [pos, setPos] = useState<{ x: number | null; y: number }>({ x: null, y: 90 });
  const W = 380;
  const left = pos.x == null ? `calc(50% - ${W / 2}px)` : pos.x;

  const onDown = (e: React.PointerEvent) => {
    const startX = pos.x == null ? window.innerWidth / 2 - W / 2 : pos.x;
    const start = { mx: e.clientX, my: e.clientY, x: startX, y: pos.y };
    const move = (ev: PointerEvent) => setPos({ x: start.x + (ev.clientX - start.mx), y: Math.max(64, start.y + (ev.clientY - start.my)) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="plugin" style={{ left, top: pos.y, width: W, borderColor: `color-mix(in srgb, ${cat} 45%, var(--border-strong))`, boxShadow: `var(--shadow-modal), 0 0 30px color-mix(in srgb, ${cat} 18%, transparent)` }}>
      <div className="pp-title" onPointerDown={onDown}>
        <span className="pp-dot" style={{ background: cat, boxShadow: `0 0 8px ${cat}` }} />
        <span className="pp-name" style={{ color: cat, textShadow: `0 0 10px color-mix(in srgb, ${cat} 40%, transparent)` }}>{instrument.name}</span>
        <span className="pp-kind">{instrument.kind === 'piano' ? 'Synth' : 'Sampler'}</span>
        {onEdit && <button className="pp-edit" onClick={onEdit} title="Edit this flow in Synflow"><Pencil size={13} /> Edit flow</button>}
        <button className="pp-close" onClick={onClose} title="Close"><X size={15} /></button>
      </div>
      <div className="pp-body">
        <Scope color={cat} />
        <div className="pp-section">
          <div className="pp-sec-title">Source</div>
          <div className="pp-knobs">
            <Knob value={.5} color={cat} size={44} label="Tune" onChange={P('tune')} />
            <Knob value={.5} color={cat} size={44} label="Spread" onChange={P('spread')} />
            <Knob value={.3} color={cat} size={44} label="Sub" onChange={P('sub')} />
            <div className="pp-wave">
              <span className="knob-label">Wave</span>
              <div className="pp-wave-btns">
                {WAVES.map((w) => (
                  <button key={w} className={`pp-wb ${wave === w ? 'on' : ''}`} onClick={() => setWave(w)}
                    style={wave === w ? { borderColor: cat, background: `color-mix(in srgb, ${cat} 18%, transparent)`, color: cat } : undefined}>{w}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="pp-div" />
        <div className="pp-section">
          <div className="pp-sec-title">Filter</div>
          <div className="pp-knobs">
            <Knob value={.6} color="var(--cat-fx)" size={44} label="Cutoff" onChange={P('cutoff')} />
            <Knob value={.4} color="var(--cat-fx)" size={44} label="Reso" onChange={P('reso')} />
          </div>
        </div>
        <div className="pp-div" />
        <div className="pp-section">
          <div className="pp-sec-title">Amp Envelope</div>
          <div className="pp-knobs">
            <Knob value={.2} color="var(--cat-mod)" size={40} label="A" onChange={P('ampA')} />
            <Knob value={.5} color="var(--cat-mod)" size={40} label="D" onChange={P('ampD')} />
            <Knob value={.7} color="var(--cat-mod)" size={40} label="S" onChange={P('ampS')} />
            <Knob value={.35} color="var(--cat-mod)" size={40} label="R" onChange={P('ampR')} />
          </div>
        </div>
      </div>
    </div>
  );
}
