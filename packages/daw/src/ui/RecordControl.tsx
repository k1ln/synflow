import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, ChevronDown, Square } from 'lucide-react';

export interface RecordOpts {
  /** Play the project while recording (starts at the playhead). */
  playAlong: boolean;
  /** Capture source: a mic (getUserMedia) or a shared browser tab's audio (getDisplayMedia). */
  source: 'mic' | 'tab';
  /** getUserMedia deviceId ('' = system default). Only used when source is 'mic'. */
  inputId: string;
  /** Audio output (AudioContext sink) deviceId ('' = system default). */
  outputId: string;
}
export const DEFAULT_REC_OPTS: RecordOpts = { playAlong: true, source: 'mic', inputId: '', outputId: '' };
const KEY = 'mothscilla:recopts';
export const loadRecOpts = (): RecordOpts => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_REC_OPTS, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_REC_OPTS;
};
export const saveRecOpts = (o: RecordOpts) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } };
export const sinkSupported = () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

/** Record button + a settings popover: input device, playback output device, and
 *  whether the project plays along while recording. */
export function RecordControl({ recording, opts, onOpts, onToggle }: {
  recording: boolean; opts: RecordOpts; onOpts: (o: RecordOpts) => void; onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputs(all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'));
      setOutputs(all.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'));
      setLabelsHidden(all.some((d) => d.kind === 'audioinput' && !d.label));
    } catch { /* no device API */ }
  }, []);
  useEffect(() => {
    if (!open) return;
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away);
    return () => { navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); window.removeEventListener('pointerdown', away); };
  }, [open, refresh]);

  // Device names are hidden until mic permission is granted once — ask on demand.
  const grant = async () => {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch { /* denied */ }
    void refresh();
  };

  return (
    <div className="rec-ctl" ref={wrap}>
      <button className={`t-btn rec ${recording ? 'on' : ''}`} onClick={onToggle} onContextMenu={(e) => { e.preventDefault(); if (!recording) setOpen(true); }}
        title={recording ? 'Stop recording' : `Record at the playhead${opts.playAlong ? ' (project plays along)' : ' (no playback)'} · right-click for options`}>
        {recording ? <Square size={12} fill="currentColor" /> : <Circle size={14} />}
      </button>
      <button className={`rec-more ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} title="Recording settings" disabled={recording}><ChevronDown size={13} /></button>
      {open && (
        <div className="rec-pop">
          <div className="rec-pop-title">Recording</div>
          <label className="rec-check">
            <input type="checkbox" checked={opts.playAlong} onChange={(e) => onOpts({ ...opts, playAlong: e.target.checked })} />
            <span>Play project while recording</span>
          </label>
          <label className="rec-field"><span>Source</span>
            <select value={opts.source} onChange={(e) => onOpts({ ...opts, source: e.target.value as RecordOpts['source'] })}>
              <option value="mic">Microphone / line-in</option>
              <option value="tab">Browser tab (Chrome)</option>
            </select>
          </label>
          {opts.source === 'mic' ? (
            <label className="rec-field"><span>Input</span>
              <select value={opts.inputId} onChange={(e) => onOpts({ ...opts, inputId: e.target.value })}>
                <option value="">System default</option>
                {inputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>)}
              </select>
            </label>
          ) : (
            <div className="rec-note">On Record, Chrome will ask you to pick a tab — check "Share tab audio". Recorded raw, with no echo cancellation, noise suppression or gain control, for the cleanest possible capture.</div>
          )}
          <label className="rec-field"><span>Playback output</span>
            <select value={opts.outputId} disabled={!sinkSupported()} onChange={(e) => onOpts({ ...opts, outputId: e.target.value })}>
              <option value="">System default</option>
              {outputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Output ${i + 1}`}</option>)}
            </select>
          </label>
          {!sinkSupported() && <div className="rec-note">This browser can't switch the output device.</div>}
          {opts.source === 'mic' && labelsHidden && <button className="rec-grant" onClick={grant}>Allow microphone to show device names</button>}
          <div className="rec-note">Records onto the selected audio track (or a new one) starting at the playhead. Use headphones when playing along to avoid bleed.</div>
        </div>
      )}
    </div>
  );
}
