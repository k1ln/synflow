import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil, Sliders } from 'lucide-react';
import type { Instrument } from '../model/project';
import { Knob } from './Knob';

interface ExposedKnob { nodeId: string; param: string; label: string; min: number; max: number; default?: number }

/** Collect the flow's host-exposed knobs (declared in Synflow → node.data.knobs). */
function exposedKnobs(inst: Instrument): ExposedKnob[] {
  return (inst.flow.nodes ?? []).flatMap((n: any) =>
    Array.isArray(n.data?.knobs)
      ? n.data.knobs.map((k: any) => ({ nodeId: n.id, param: k.param, label: k.label || k.param, min: k.min ?? 0, max: k.max ?? 1, default: k.default }))
      : [],
  );
}

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

export function PluginPanel({ instrument, onClose, onSetParam, onEdit }: {
  instrument: Instrument;
  onClose: () => void;
  /** Set a real engine param live: (nodeId, param, value) on the running instrument. */
  onSetParam?: (nodeId: string, param: string, value: number) => void;
  /** Open this instrument's flow in the synflow editor. */
  onEdit?: () => void;
}) {
  const cat = 'var(--cat-source)';
  const knobs = useMemo(() => exposedKnobs(instrument), [instrument.flow]);
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

  const norm = (k: ExposedKnob) => { const v = k.default ?? k.min; const r = k.max - k.min || 1; return Math.max(0, Math.min(1, (v - k.min) / r)); };

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
        {knobs.length > 0 ? (
          <div className="pp-section">
            <div className="pp-sec-title">Controls</div>
            <div className="pp-knobs">
              {knobs.map((k) => (
                <Knob
                  key={`${k.nodeId}.${k.param}`} value={norm(k)} color={cat} size={46} label={k.label}
                  onChange={(v) => onSetParam?.(k.nodeId, k.param, k.min + v * (k.max - k.min))}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="pp-empty">
            <Sliders size={18} />
            <div>No exposed controls yet.</div>
            <div className="pp-empty-sub">Open <b>Edit flow</b> and, in Synflow’s Host Interface panel, expose params (filter cutoff, ADSR, …) as knobs.</div>
            {onEdit && <button className="pp-empty-btn" onClick={onEdit}><Pencil size={13} /> Edit flow</button>}
          </div>
        )}
      </div>
    </div>
  );
}
