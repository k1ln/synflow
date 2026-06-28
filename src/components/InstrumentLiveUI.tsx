import React, { useEffect, useRef, useState } from 'react';
import { X, LayoutDashboard, GripVertical } from 'lucide-react';
import { flowKnobs, knob01, knobValue, knobReadout, flowKind, type ExposedKnob } from '../host/flowKnobs';
import { Knob } from './Knob';
import { CustomInstrumentUI } from './CustomInstrumentUI';
import './InstrumentLiveUI.css';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlackKey = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const midiName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
// QWERTY → semitone offset, one octave + a bit (matches the DAW's live keyboard).
const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
const VISIBLE = 17;

/**
 * Floating, draggable "Instrument UI" for the flow editor: play the live flow
 * (synth keyboard / drum pad), tweak every knob exposed via the Host Interface,
 * and switch between the auto-generated Default panel and a saved Custom HTML
 * faceplate. "Edit UI" opens the faceplate authoring modal. The faceplate is
 * stored on flow.customUi and renders identically in the DAW.
 */
export function InstrumentLiveUI({ title, nodes, customUi, valueOf, onKnob, onKnobRename, onNoteOn, onNoteOff, onHit, onEditUi, onClose }: {
  title: string;
  nodes: any[];
  customUi?: string;
  valueOf: (nodeId: string, param: string) => number | undefined;
  onKnob: (nodeId: string, param: string, value: number) => void;
  onKnobRename?: (nodeId: string, param: string, label: string) => void;
  onNoteOn?: (midi: number, velocity?: number) => void;
  onNoteOff?: (midi: number) => void;
  onHit?: () => void;
  onEditUi: () => void;
  onClose: () => void;
}) {
  const kind = flowKind(nodes);
  const knobs: ExposedKnob[] = flowKnobs(nodes);
  const hasCustom = kind !== 'effect' && !!customUi;
  const [customMode, setCustomMode] = useState(hasCustom);
  useEffect(() => { setCustomMode(hasCustom); }, [hasCustom]);

  const accent = kind === 'drum' ? '#ffb454' : kind === 'effect' ? '#7aa2ff' : '#6ee7a8';
  const [octave, setOctave] = useState(4);
  const base = 12 * (octave + 1);
  const down = useRef(new Set<number>());
  const [lit, setLit] = useState<Set<number>>(new Set());
  const on = (m: number) => { if (down.current.has(m)) return; down.current.add(m); setLit(new Set(down.current)); onNoteOn?.(m); };
  const off = (m: number) => { if (!down.current.has(m)) return; down.current.delete(m); setLit(new Set(down.current)); onNoteOff?.(m); };

  // Computer-keyboard playing (only when not editing the custom HTML elsewhere).
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
  }, [base, kind, onHit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draggable panel position.
  const [pos, setPos] = useState({ x: window.innerWidth - 540, y: 88 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input')) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: PointerEvent) => { if (dragRef.current) setPos({ x: ev.clientX - dragRef.current.dx, y: Math.max(0, ev.clientY - dragRef.current.dy) }); };
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const midis = Array.from({ length: VISIBLE }, (_, i) => base + i);
  const whites = midis.filter((m) => !isBlackKey(m));

  return (
    <div className="lui-panel" style={{ left: pos.x, top: pos.y, ['--lui-accent' as any]: accent }}>
      <div className="lui-bar" onPointerDown={startDrag}>
        <GripVertical size={14} className="lui-grip" />
        <span className="lui-dot" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="lui-name" style={{ color: accent }}>{title || 'Instrument'}</span>
        <span className="lui-kind">{kind}</span>
        {hasCustom && (
          <div className="lui-uimode">
            <button className={`lui-uitab ${customMode ? 'on' : ''}`} onClick={() => setCustomMode(true)}>Custom</button>
            <button className={`lui-uitab ${!customMode ? 'on' : ''}`} onClick={() => setCustomMode(false)}>Default</button>
          </div>
        )}
        {kind !== 'effect' && (
          <button className="lui-edit" onClick={onEditUi} title="Design a custom HTML faceplate for this flow"><LayoutDashboard size={13} /> {customUi ? 'Edit UI' : 'Custom UI'}</button>
        )}
        <button className="lui-close" onClick={onClose} title="Close"><X size={15} /></button>
      </div>

      <div className="lui-body">
        {customMode && customUi ? (
          <CustomInstrumentUI className="lui-custom" html={customUi} knobs={knobs} valueOf={valueOf}
            onKnob={onKnob} onNoteOn={onNoteOn} onNoteOff={onNoteOff} onHit={onHit} />
        ) : (<>
          {knobs.length === 0 && (
            <div className="lui-noknobs">No knobs exposed. Open <b>Expose to DAW</b> in the toolbar and tick params on a node to make them playable here.</div>
          )}
          {knobs.length > 0 && (
            <div className="lui-knobs">
              {knobs.map((k) => (
                <Knob key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={accent} size={48} label={k.label}
                  format={(v01) => knobReadout(k, v01)}
                  onChange={(v01) => onKnob(k.nodeId, k.param, knobValue(k, v01))}
                  onLabelChange={onKnobRename ? (label) => onKnobRename(k.nodeId, k.param, label) : undefined} />
              ))}
            </div>
          )}

          {kind === 'synth' && (
            <>
              <div className="lui-octrow">
                <span className="lui-octlabel">Octave</span>
                <button className="lui-oct" onClick={() => setOctave((o) => Math.max(0, o - 1))}>−</button>
                <span className="lui-octval">C{octave}</span>
                <button className="lui-oct" onClick={() => setOctave((o) => Math.min(8, o + 1))}>+</button>
                <span className="lui-playhint">play with a–k</span>
              </div>
              <div className="lui-keyboard" style={{ ['--whites' as any]: whites.length }}>
                <div className="lui-whites">
                  {whites.map((m) => (
                    <button key={m} className={`lui-white ${lit.has(m) ? 'on' : ''}`}
                      onPointerDown={(e) => { e.preventDefault(); on(m); }} onPointerUp={() => off(m)} onPointerLeave={(e) => { if (e.buttons) off(m); }}>
                      {m % 12 === 0 && <span className="lui-keylabel">{midiName(m)}</span>}
                    </button>
                  ))}
                </div>
                <div className="lui-blacks">
                  {whites.map((m, i) => {
                    if (!isBlackKey(m + 1) || i === whites.length - 1) return null;
                    const b = m + 1;
                    return (
                      <button key={b} className={`lui-black ${lit.has(b) ? 'on' : ''}`}
                        style={{ left: `calc(${((i + 1) / whites.length) * 100}% - (100% / ${whites.length}) * 0.3)` }}
                        onPointerDown={(e) => { e.preventDefault(); on(b); }} onPointerUp={() => off(b)} onPointerLeave={(e) => { if (e.buttons) off(b); }} />
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {kind === 'drum' && (
            <button className="lui-pad" onPointerDown={(e) => { e.preventDefault(); onHit?.(); }} title="Hit (Space)">{title || 'HIT'}<span>tap / Space</span></button>
          )}
        </>)}
      </div>
    </div>
  );
}
