import React, { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { EQ_FX_ID, type FxInsert, type EqSettings } from '../model/project';
import { findEntry, type LibraryEntry } from '../synflow/library';
import { flowKnobs, knob01, knobValue } from '../synflow/knobs';
import { eqMagnitudeDb, logFreqs } from '../audio/eqResponse';
import { Knob } from './Knob';

/** Tiny EQ response thumbnail shown on the device card (in place of knobs). */
function EqThumb({ settings, color }: { settings: EqSettings; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const g = c.getContext('2d'); if (!g) return;
    const w = c.width, h = c.height, DBR = 18;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const freqs = logFreqs(w); const mags = eqMagnitudeDb(settings.on ? settings.bands : [], freqs, 48000, settings.outDb);
    g.beginPath();
    for (let i = 0; i < w; i++) { const y = h / 2 - (Math.max(-DBR, Math.min(DBR, mags[i])) / DBR) * (h / 2 - 2); i ? g.lineTo(i, y) : g.moveTo(i, y); }
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
  }, [settings, color]);
  return <canvas ref={ref} width={132} height={42} className="fxdev-eq" />;
}

/** A horizontal FX chain editor (used at instrument / track / master level).
 *  Each insert is a device card with its Synflow-exported knobs. */
export function FxBar({ label, color, fx, effects, onAdd, onRemove, onEdit, onKnob, compact }: {
  label: string;
  color?: string;
  fx: FxInsert[];
  effects: LibraryEntry[];
  onAdd: (fxId: string) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
  onKnob?: (index: number, nodeId: string, param: string, value: number) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const c = color ?? 'var(--cat-fx)';
  return (
    <div className={`fxbar ${compact ? 'compact' : ''}`}>
      <span className="fxbar-label" style={{ color: c }}>{label}</span>
      <div className="fxbar-row">
        {fx.length === 0 && <span className="fxbar-empty">no fx</span>}
        {fx.map((ins, i) => {
          const isEq = ins.fxId === EQ_FX_ID;
          const knobs = isEq ? [] : flowKnobs(ins.flow ?? findEntry(ins.fxId)?.flow);
          return (
            <div className="fxdev" key={ins.id} style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}>
              <div className="fxdev-head">
                <span className="fxdev-name" style={{ color: c }}>{ins.name}</span>
                <button className="fxbar-icon" title={isEq ? 'Open EQ' : 'Edit in Synflow'} onClick={() => onEdit(i)}><Pencil size={11} /></button>
                <button className="fxbar-icon" title="Remove" onClick={() => onRemove(i)}><X size={11} /></button>
              </div>
              {isEq && ins.eq && <button className="fxdev-eq-btn" onClick={() => onEdit(i)} title="Open EQ"><EqThumb settings={ins.eq} color={c} /></button>}
              {knobs.length > 0 && (
                <div className="fxdev-knobs">
                  {knobs.map((k) => (
                    <Knob
                      key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={c} size={34} label={k.label}
                      onChange={onKnob ? (v) => onKnob(i, k.nodeId, k.param, knobValue(k, v)) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="fxbar-add">
          <button className="fxbar-addbtn" onClick={() => setPicking((p) => !p)} title="Add effect"
            style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}><Plus size={14} /></button>
          {picking && (
            <div className="fxbar-menu" onMouseLeave={() => setPicking(false)}>
              {effects.length === 0 && <span className="fxbar-none">no effects loaded</span>}
              {effects.map((e) => <button key={e.id} onClick={() => { onAdd(e.id); setPicking(false); }}>{e.name}</button>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
