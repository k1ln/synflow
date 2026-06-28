import React, { useState } from 'react';
import { X, Wand2, Save, RotateCcw } from 'lucide-react';
import { type ExposedKnob } from '../synflow/knobs';
import { CustomInstrumentUI } from './CustomInstrumentUI';

/** Build starter HTML from a flow's exposed knobs: a labeled slider + readout per
 *  knob, plus a playable note row (synth) or a hit pad (drum). The author edits
 *  from here — styling lives in the embedded <style>. */
export function customUiTemplate(knobs: ExposedKnob[], kind: 'synth' | 'drum' | 'effect'): string {
  const rows = knobs.map((k) => `    <label class="ctl">
      <span class="lbl">${k.label}</span>
      <input type="range" data-param="${k.nodeId}.${k.param}">
      <span class="val" data-readout="${k.nodeId}.${k.param}"></span>
    </label>`).join('\n');
  const pads = kind === 'drum'
    ? '  <div class="pad big" data-hit>HIT</div>'
    : kind === 'synth'
      ? `  <div class="keys">\n${[60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => `    <div class="key" data-note="${m}">${['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'][i]}</div>`).join('\n')}\n  </div>`
      : '';
  return `<style>
  .panel { font-family: system-ui, sans-serif; color: #e8f6ee; padding: 18px;
    background: radial-gradient(120% 140% at 50% 0%, #16202a, #0a0e14);
    border-radius: 12px; display: flex; flex-direction: column; gap: 14px; max-width: 560px; }
  .title { font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #36e08e; }
  .ctl { display: grid; grid-template-columns: 90px 1fr 48px; align-items: center; gap: 10px; font-size: 12px; }
  .lbl { text-transform: uppercase; letter-spacing: .05em; opacity: .8; }
  .val { font-family: ui-monospace, monospace; text-align: right; color: #36e08e; }
  input[type=range] { width: 100%; accent-color: #36e08e; }
  .keys { display: flex; gap: 6px; margin-top: 4px; }
  .key { flex: 1; height: 80px; border-radius: 0 0 8px 8px; display: flex; align-items: flex-end;
    justify-content: center; padding-bottom: 8px; font-size: 11px; font-weight: 700;
    background: linear-gradient(180deg, #f2f6fb, #c7d0dd); color: #2a3340; }
  .key.on { background: linear-gradient(180deg, #36e08e, #1f9d63); color: #06120c; }
  .pad.big { height: 120px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 800; letter-spacing: .1em; color: #06120c;
    background: linear-gradient(180deg, #36e08e, #1f9d63); }
  .pad.big.on { filter: brightness(1.3); }
</style>
<div class="panel">
  <div class="title">My Instrument</div>
${rows}
${pads}
</div>`;
}

/** Modal: write a custom HTML UI for an instrument, with a live, playable preview. */
export function CustomUiEditor({ poolName, kind, initialHtml, knobs, valueOf, onKnob, onNoteOn, onNoteOff, onHit, onSave, onClose }: {
  poolName: string;
  kind: 'synth' | 'drum' | 'effect';
  initialHtml: string;
  knobs: ExposedKnob[];
  valueOf: (nodeId: string, param: string) => number | undefined;
  onKnob: (nodeId: string, param: string, value: number) => void;
  onNoteOn?: (midi: number, velocity?: number) => void;
  onNoteOff?: (midi: number) => void;
  onHit?: () => void;
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialHtml || customUiTemplate(knobs, kind));

  return (
    <div className="syn-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cui-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="syn-head">
          <span className="syn-dot" />
          <span className="syn-title">Custom UI — {poolName}</span>
          <span className="syn-hint">bind with data-param · data-note · data-readout · data-hit</span>
          <button className="syn-close" style={{ marginLeft: 'auto' }} onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="cui-body">
          <div className="cui-edit">
            <div className="cui-toolbar">
              <button className="cui-tool" onClick={() => setDraft(customUiTemplate(knobs, kind))} title="Replace with a starter template generated from this instrument's knobs"><Wand2 size={13} /> Template</button>
              <button className="cui-tool" onClick={() => setDraft(initialHtml)} disabled={draft === initialHtml} title="Revert to the saved UI"><RotateCcw size={13} /> Revert</button>
              <span className="cui-attrs">{knobs.length} param{knobs.length === 1 ? '' : 's'}: {knobs.map((k) => `${k.nodeId}.${k.param}`).join(' · ') || '—'}</span>
            </div>
            <textarea className="cui-code" value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)}
              placeholder="Write HTML here…" />
          </div>
          <div className="cui-preview">
            <div className="cui-preview-label">Live preview — playable</div>
            <CustomInstrumentUI className="cui-preview-stage" html={draft} knobs={knobs} valueOf={valueOf}
              onKnob={onKnob} onNoteOn={onNoteOn} onNoteOff={onNoteOff} onHit={onHit} />
          </div>
        </div>
        <div className="cui-foot">
          <button className="exp-secondary" onClick={onClose}>Cancel</button>
          <button className="exp-primary" onClick={() => { onSave(draft); onClose(); }}><Save size={14} /> Save UI</button>
        </div>
      </div>
    </div>
  );
}
