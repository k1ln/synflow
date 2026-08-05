import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, LayoutDashboard, Link2 } from 'lucide-react';
import type { Flow } from '../synflow/instruments';
import type { FxInsert } from '../model/project';
import type { LibraryEntry } from '../synflow/library';
import { isBlackKey, midiName } from '../model/pitch';
import { flowKnobs, flowOptions, knob01, knobValue, knobReadout } from '../synflow/knobs';
import { isVstaiFlow, vstaiHtmlOf } from '../synflow/vstai';
import { VstaiGui, type VstaiParamMeta } from './VstaiGui';
import { Knob } from './Knob';
import { OptionButtons } from './OptionButtons';
import { FxBar } from './FxBar';
import { CustomInstrumentUI } from './CustomInstrumentUI';

const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
const VISIBLE = 17;

/**
 * Full-page live view for a pool item (NOT a popup): play it live (synth keyboard
 * / drum pad), tweak every knob exported from Synflow, set its gain, edit the flow.
 * Effects show only their knobs (no live play).
 */
export function InstrumentPanel({ name, trackName, kind, flow, gain, onGain, onKnob, onKnobRename, onEdit, onBack, onNoteOn, onNoteOff, onHit, customUi, onEditUi, fx, effects, onFxAdd, onFxRemove, onFxEdit, onFxKnob, onVstaiSample, onAutomateParam }: {
  name: string;
  /** Set only for a track-scoped session (Track Live): shows a badge so it's never
   *  mistaken for the shared/pool instrument, which every other track also hears. */
  trackName?: string;
  kind: 'synth' | 'drum' | 'effect';
  flow: Flow;
  gain?: number;
  onGain?: (v: number) => void;
  onKnob: (nodeId: string, param: string, value: number | string) => void;
  onKnobRename?: (nodeId: string, param: string, label: string) => void;
  onEdit: () => void;
  onBack?: () => void;
  onNoteOn?: (midi: number) => void;
  onNoteOff?: (midi: number) => void;
  onVstaiSample?: (msg: { channels: number; frames: number; rate: number; data: Float32Array }) => void;
  /** Add automation for a plugin param (from its GUI right-click menu). */
  onAutomateParam?: (nodeId: string, param: string, label: string, min: number, max: number, mode: 'step' | 'curve') => void;
  onHit?: () => void;
  // custom HTML UI (instruments only)
  customUi?: string;
  onEditUi?: () => void;
  // instrument-general FX (instruments only)
  fx?: FxInsert[];
  effects?: LibraryEntry[];
  onFxAdd?: (fxId: string) => void;
  onFxRemove?: (i: number) => void;
  onFxEdit?: (i: number) => void;
  onFxKnob?: (i: number, nodeId: string, param: string, value: number | string) => void;
}) {
  const isVstai = isVstaiFlow(flow);
  const vstaiHtml = isVstai ? vstaiHtmlOf(flow) : undefined;
  const vstaiParams: VstaiParamMeta[] = isVstai
    ? flowKnobs(flow).map((k) => { const m = /^param(\d+)$/.exec(k.param); return m ? { index: +m[1], label: k.label, min: k.min, max: k.max } : null; }).filter((x): x is VstaiParamMeta => !!x)
    : [];
  // Persisted knob positions (flow node data) → restore the plugin GUI on (re)open.
  const vstaiValues: Record<number, number> = {};
  if (isVstai) { const vd = flow.nodes.find((n: any) => n.id === 'vstai')?.data; for (const p of vstaiParams) { const v = vd?.[`param${p.index}`]; if (typeof v === 'number') vstaiValues[p.index] = v; } }
  const knobs = isVstai ? [] : flowKnobs(flow);
  // (options computed below is also skipped for vstai via the GUI branch)
  const options = flowOptions(flow);
  const valueOf = (nodeId: string, param: string): number | undefined => flow.nodes.find((n: any) => n.id === nodeId)?.data?.[param];
  const hasCustom = kind !== 'effect' && !!customUi;
  const [customMode, setCustomMode] = useState(hasCustom);
  useEffect(() => { setCustomMode(hasCustom); }, [hasCustom, name]);
  const cat = kind === 'synth' ? 'var(--cat-mod)' : kind === 'drum' ? 'var(--cat-source)' : 'var(--cat-fx)';
  const [octave, setOctave] = useState(4);
  const base = 12 * (octave + 1);
  const down = useRef(new Set<number>());
  const [lit, setLit] = useState<Set<number>>(new Set());
  const on = (m: number) => { if (down.current.has(m)) return; down.current.add(m); setLit(new Set(down.current)); onNoteOn?.(m); };
  const off = (m: number) => { if (!down.current.has(m)) return; down.current.delete(m); setLit(new Set(down.current)); onNoteOff?.(m); };

  // Changing the octave shifts `base`, so a still-held key's keyup would arrive at a
  // NEW pitch and never match the noteOn we sent — leaving the old note stuck on.
  // Release everything held whenever the octave changes (skip the initial mount).
  const prevBase = useRef(base);
  useEffect(() => {
    if (prevBase.current === base) return;
    prevBase.current = base;
    for (const m of [...down.current]) onNoteOff?.(m);
    down.current.clear();
    setLit(new Set());
  }, [base, onNoteOff]);

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
        {onBack && <button className="lp-back" onClick={onBack} title="Back"><ArrowLeft size={16} /> Back</button>}
        <span className="inst-dot" style={{ background: cat }} />
        <span className="lp-name" style={{ color: cat }}>{name}</span>
        <span className="inst-kind">{kind}</span>
        {trackName && (
          <span className="lp-track-badge" title={`Opened inside track "${trackName}" — this is that track's own copy; edits here are independent of the shared instrument and every other track`}>
            <Link2 size={11} /> On track: {trackName}
          </span>
        )}
        {hasCustom && (
          <div className="lp-uimode">
            <button className={`lp-uitab ${customMode ? 'on' : ''}`} onClick={() => setCustomMode(true)}>Custom</button>
            <button className={`lp-uitab ${!customMode ? 'on' : ''}`} onClick={() => setCustomMode(false)}>Default</button>
          </div>
        )}
        {kind !== 'effect' && onEditUi && (
          <button className="pp-edit" onClick={onEditUi} title="Design a custom HTML UI for the Live view"><LayoutDashboard size={13} /> {customUi ? 'Edit UI' : 'Custom UI'}</button>
        )}
        {isVstai
          ? <span className="fxdev-ai" title="AI plugin (.vstai) — has its own GUI below; not editable in Synflow">AI PLUGIN</span>
          : <button className="pp-edit" onClick={onEdit} title="Edit this flow in Synflow"><Pencil size={13} /> Edit flow</button>}
      </div>

      <div className="lp-body">
        {customMode && customUi ? (
          <CustomInstrumentUI className="lp-custom" html={customUi} knobs={knobs} valueOf={valueOf}
            onKnob={onKnob} onNoteOn={onNoteOn} onNoteOff={onNoteOff} onHit={onHit} />
        ) : (<>
        {isVstai && (
          <div className="lp-group">
            <div className="lp-section-title">Plugin GUI</div>
            {vstaiHtml
              ? <VstaiGui html={vstaiHtml} maxHeight="62vh" params={vstaiParams} values={vstaiValues}
                  onParam={(i, v) => onKnob('vstai', `param${i}`, v)}
                  onNote={(nOn, note) => { if (nOn) onNoteOn?.(note); else onNoteOff?.(note); }}
                  onKey={(dn, key) => { const sm = KEYMAP[key.toLowerCase()]; if (sm == null) return; if (dn) on(base + sm); else off(base + sm); }}
                  onSample={onVstaiSample}
                  onAutomate={onAutomateParam ? (i, label, min, max, mode) => onAutomateParam('vstai', `param${i}`, label, min, max, mode) : undefined} />
              : <div className="inst-noknobs">This AI plugin shipped without a GUI — its parameters are host-automated only.</div>}
          </div>
        )}
        {!isVstai && knobs.length === 0 && options.length === 0 && <div className="inst-noknobs">No params exported. Open <b>Edit flow</b> and expose knobs or option buttons in Synflow’s Host Interface.</div>}
        {(knobs.length > 0 || options.length > 0) && (
          <div className="lp-group">
            <div className="lp-section-title">Parameters</div>
            {options.length > 0 && (
              <div className="inst-opts">
                {options.map((o) => (
                  <OptionButtons key={`${o.nodeId}.${o.param}`} opt={o} color={cat}
                    onChange={(v) => onKnob(o.nodeId, o.param, v)} />
                ))}
              </div>
            )}
            {knobs.length > 0 && (
              <div className="inst-knobs inst-knobs-matrix">
                {knobs.map((k) => (
                  <Knob key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={cat} size={50} label={k.label}
                    format={(v01) => knobReadout(k, v01)}
                    onChange={(v01) => onKnob(k.nodeId, k.param, knobValue(k, v01))}
                    onLabelChange={onKnobRename ? (label) => onKnobRename(k.nodeId, k.param, label) : undefined} />
                ))}
              </div>
            )}
          </div>
        )}

        {kind !== 'effect' && onGain && (
          <div className="lp-group">
            <div className="lp-section-title">Output</div>
            <div className="inst-knobs">
              <Knob value={Math.min(1, (gain ?? 1) / 1.5)} color="var(--accent)" size={50} label="Gain" readout={`${Math.round((gain ?? 1) * 100)}%`}
                onChange={(v01) => onGain(v01 * 1.5)} />
            </div>
          </div>
        )}
        {kind !== 'effect' && onFxAdd && (
          <div className="lp-group">
            <div className="lp-section-title">Instrument FX</div>
            <FxBar label="" color="var(--cat-mod)" fx={fx ?? []} effects={effects ?? []}
              onAdd={onFxAdd} onRemove={(i) => onFxRemove?.(i)} onEdit={(i) => onFxEdit?.(i)} onKnob={onFxKnob} />
          </div>
        )}

        </>)}
      </div>

      {/* Play surface DOCKED at the bottom (outside the scroll) so it stays a full,
          playable size no matter how tall the instrument's GUI / params are. */}
      {kind !== 'effect' && !customMode && (
        <div className="lp-keys-dock">
          {kind === 'synth' ? (
            <>
              <div className="inst-octrow">
                <span className="live-label">Octave</span>
                <button className="live-oct" onClick={() => setOctave((o) => Math.max(0, o - 1))}>−</button>
                <span className="live-octval">C{octave}</span>
                <button className="live-oct" onClick={() => setOctave((o) => Math.min(8, o + 1))}>+</button>
                <span className="live-hint">play with a–k, click, or MIDI</span>
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
          ) : (
            <button className="inst-pad lp-pad" onPointerDown={(e) => { e.preventDefault(); onHit?.(); }} title="Hit (Space)">{name}<span>tap / Space</span></button>
          )}
        </div>
      )}
    </div>
  );
}
