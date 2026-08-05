import React, { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { EQ_FX_ID, type FxInsert, type EqSettings } from '../model/project';
import { findEntry, type LibraryEntry } from '../synflow/library';
import { flowKnobs, flowOptions, knob01, knobReadout, knobValue } from '../synflow/knobs';
import { isVstaiFlow } from '../synflow/vstai';
import { eqMagnitudeDb, logFreqs } from '../audio/eqResponse';
import { Knob } from './Knob';
import { OptionButtons } from './OptionButtons';

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
export function FxBar({ label, color, fx, effects, onAdd, onRemove, onEdit, onKnob, onBrowse, compact }: {
  label: string;
  color?: string;
  fx: FxInsert[];
  effects: LibraryEntry[];
  onAdd: (fxId: string) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
  onKnob?: (index: number, nodeId: string, param: string, value: number | string) => void;
  onBrowse?: () => void;   // open the detailed plugin browser (library + VibeSynth gallery)
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
          const flow = ins.flow ?? findEntry(ins.fxId)?.flow;
          const isVstai = !isEq && isVstaiFlow(flow);          // AI plugin: its own GUI, no DAW knobs
          const knobs = isEq || isVstai ? [] : flowKnobs(flow);
          const options = isEq || isVstai ? [] : flowOptions(flow);
          return (
            <div className="fxdev" key={ins.id} style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}>
              <div className="fxdev-head">
                <span className="fxdev-name" style={{ color: c }}>{ins.name}</span>
                {isVstai && <span className="fxdev-ai" title="AI plugin (.vstai) — has its own GUI; not editable in Synflow">AI</span>}
                <button className="fxbar-icon" title={isEq ? 'Open EQ' : isVstai ? 'Open plugin GUI' : 'Edit in Synflow'} onClick={() => onEdit(i)}><Pencil size={11} /></button>
                <button className="fxbar-icon" title="Remove" onClick={() => onRemove(i)}><X size={11} /></button>
              </div>
              {isEq && ins.eq && <button className="fxdev-eq-btn" onClick={() => onEdit(i)} title="Open EQ"><EqThumb settings={ins.eq} color={c} /></button>}
              {isVstai && <button className="fxdev-gui-btn" onClick={() => onEdit(i)} title="Open the plugin's own GUI">Open plugin GUI</button>}
              {knobs.length > 0 && (
                <div className="fxdev-knobs">
                  {knobs.map((k) => (
                    <Knob
                      key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={c} size={34} label={k.label}
                      format={(v01) => knobReadout(k, v01)}
                      onChange={onKnob ? (v) => onKnob(i, k.nodeId, k.param, knobValue(k, v)) : undefined}
                    />
                  ))}
                </div>
              )}
              {options.length > 0 && (
                <div className="fxdev-opts">
                  {options.map((o) => (
                    <OptionButtons key={`${o.nodeId}.${o.param}`} opt={o} color={c} compact
                      onChange={onKnob ? (v) => onKnob(i, o.nodeId, o.param, v) : undefined} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="fxbar-add">
          <button className="fxbar-addbtn" title="Add effect"
            onClick={() => { if (onBrowse) onBrowse(); else setPicking((p) => !p); }}
            style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}><Plus size={14} /></button>
          {picking && !onBrowse && (
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
