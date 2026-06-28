import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { Flow } from '../synflow/instruments';
import { isBlackKey, midiName } from '../model/pitch';
import { flowKnobs, knob01, knobValue } from '../synflow/knobs';
import { Knob } from './Knob';

const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
const VISIBLE = 17;

/**
 * Full-page live view for a pool item (NOT a popup): play it live (synth keyboard
 * / drum pad), tweak every knob exported from Synflow, set its gain, edit the flow.
 * Effects show only their knobs (no live play).
 */
export function InstrumentPanel({ name, kind, flow, gain, onGain, onKnob, onEdit, onBack, onNoteOn, onNoteOff, onHit }: {
  name: string;
  kind: 'synth' | 'drum' | 'effect';
  flow: Flow;
  gain?: number;
  onGain?: (v: number) => void;
  onKnob: (nodeId: string, param: string, value: number) => void;
  onEdit: () => void;
  onBack: () => void;
  onNoteOn?: (midi: number) => void;
  onNoteOff?: (midi: number) => void;
  onHit?: () => void;
}) {
  const knobs = flowKnobs(flow);
  const cat = kind === 'synth' ? 'var(--cat-mod)' : kind === 'drum' ? 'var(--cat-source)' : 'var(--cat-fx)';
  const [octave, setOctave] = useState(4);
  const base = 12 * (octave + 1);
  const down = useRef(new Set<number>());
  const [lit, setLit] = useState<Set<number>>(new Set());
  const on = (m: number) => { if (down.current.has(m)) return; down.current.add(m); setLit(new Set(down.current)); onNoteOn?.(m); };
  const off = (m: number) => { if (!down.current.has(m)) return; down.current.delete(m); setLit(new Set(down.current)); onNoteOff?.(m); };

  useEffect(() => {
    if (kind === 'effect') return;
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || typing(e.target)) return;
      if (kind === 'drum') { if (e.key === ' ') { e.preventDefault(); onHit?.(); } return; }
      const s = KEYMAP[e.key.toLowerCase()]; if (s != null) { e.preventDefault(); on(base + s); }
    };
    const ku = (e: KeyboardEvent) => { const s = KEYMAP[e.key.toLowerCase()]; if (s != null) off(base + s); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [base, kind, onHit]);

  const midis = Array.from({ length: VISIBLE }, (_, i) => base + i);
  const whites = midis.filter((m) => !isBlackKey(m));

  return (
    <div className="live-page">
      <div className="lp-head">
        <button className="lp-back" onClick={onBack} title="Back"><ArrowLeft size={16} /> Back</button>
        <span className="inst-dot" style={{ background: cat, boxShadow: `0 0 8px ${cat}` }} />
        <span className="lp-name" style={{ color: cat }}>{name}</span>
        <span className="inst-kind">{kind}</span>
        {kind !== 'effect' && onGain && (
          <label className="inst-gain" title="Instrument gain">
            <span>Gain</span>
            <input type="range" min={0} max={1.5} step={0.01} value={gain ?? 1} onChange={(e) => onGain(parseFloat(e.target.value))} />
            <b>{Math.round((gain ?? 1) * 100)}</b>
          </label>
        )}
        <button className="pp-edit" onClick={onEdit} title="Edit this flow in Synflow"><Pencil size={13} /> Edit flow</button>
      </div>

      <div className="lp-body">
        <div className="lp-section-title">Knobs from Synflow</div>
        <div className="inst-knobs">
          {knobs.length === 0 && <div className="inst-noknobs">No knobs exported. Open <b>Edit flow</b> and expose params in Synflow’s Host Interface.</div>}
          {knobs.map((k) => (
            <Knob key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={cat} size={54} label={k.label}
              onChange={(v01) => onKnob(k.nodeId, k.param, knobValue(k, v01))} />
          ))}
        </div>

        {kind === 'synth' && (
          <>
            <div className="inst-octrow">
              <span className="live-label">Octave</span>
              <button className="live-oct" onClick={() => setOctave((o) => Math.max(0, o - 1))}>−</button>
              <span className="live-octval">C{octave}</span>
              <button className="live-oct" onClick={() => setOctave((o) => Math.min(8, o + 1))}>+</button>
              <span className="live-hint">play with a–k or the keys</span>
            </div>
            <div className="live-keyboard lp-kb" style={{ ['--whites' as any]: whites.length }}>
              <div className="lk-whites">
                {whites.map((m) => (
                  <button key={m} className={`lk-white ${lit.has(m) ? 'on' : ''}`}
                    onPointerDown={(e) => { e.preventDefault(); on(m); }} onPointerUp={() => off(m)} onPointerLeave={(e) => { if (e.buttons) off(m); }}>
                    {m % 12 === 0 && <span className="lk-oct">{midiName(m)}</span>}
                  </button>
                ))}
              </div>
              <div className="lk-blacks">
                {whites.map((m, i) => {
                  if (!isBlackKey(m + 1) || i === whites.length - 1) return null;
                  const b = m + 1;
                  return (
                    <button key={b} className={`lk-black ${lit.has(b) ? 'on' : ''}`}
                      style={{ left: `calc(${((i + 1) / whites.length) * 100}% - (100% / ${whites.length}) * 0.3)` }}
                      onPointerDown={(e) => { e.preventDefault(); on(b); }} onPointerUp={() => off(b)} onPointerLeave={(e) => { if (e.buttons) off(b); }} />
                  );
                })}
              </div>
            </div>
          </>
        )}
        {kind === 'drum' && (
          <button className="inst-pad lp-pad" onPointerDown={(e) => { e.preventDefault(); onHit?.(); }} title="Hit (Space)">{name}<span>tap / Space</span></button>
        )}
      </div>
    </div>
  );
}
