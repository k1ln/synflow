import React, { useState } from 'react';
import { X, Film, AudioWaveform, Layers, Download, FileJson, Loader } from 'lucide-react';
import { RES_PRESETS, FPS_PRESETS, QUALITY_PRESETS, FORMAT_PRESETS, type ExportContent, type ExportFormat, type ExportOpts, type ExportQuality } from '../audio/videoExport';

const fmtBars = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * Detailed export popup (MAW). Choose what to render — Both / Video only /
 * Audio only — plus resolution, fps, format (MP4/WebM), quality, and an optional
 * in/out range. Audio-only renders a WAV; video uses the WebCodecs pipeline. The
 * portable project (.json) export lives here too.
 */
export function ExportDialog({
  hasVideo, bars, secPerBar, busy, progress, phase, onClose, onRun, onExportProject,
}: {
  hasVideo: boolean;
  bars: number;            // total song length in bars
  secPerBar: number;
  busy: boolean;
  progress: number;        // 0..1
  phase: string;
  onClose: () => void;
  onRun: (opts: ExportOpts) => void;
  onExportProject: () => void;
}) {
  const [content, setContent] = useState<ExportContent>(hasVideo ? 'both' : 'audio');
  const [resLabel, setResLabel] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [quality, setQuality] = useState<ExportQuality>('medium');
  const [rangeOn, setRangeOn] = useState(false);
  const [startBar, setStartBar] = useState(0);
  const [endBar, setEndBar] = useState(bars);

  const isAudioOnly = content === 'audio';
  const res = RES_PRESETS.find((r) => r.label === resLabel) ?? RES_PRESETS[0];
  const lo = Math.max(0, Math.min(startBar, bars));
  const hi = Math.max(lo + 1, Math.min(endBar, bars));

  const run = () => onRun({
    content, height: res.height, fps, format, quality,
    range: rangeOn ? { startSec: lo * secPerBar, endSec: hi * secPerBar } : undefined,
  });

  const CONTENT: { id: ExportContent; label: string; icon: React.ComponentType<any>; need: boolean }[] = [
    { id: 'both', label: 'Video + Audio', icon: Layers, need: true },
    { id: 'video', label: 'Video only', icon: Film, need: true },
    { id: 'audio', label: 'Audio only', icon: AudioWaveform, need: false },
  ];

  return (
    <div className="syn-overlay" onClick={busy ? undefined : onClose}>
      <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="exp-head">
          <span className="exp-title"><Download size={15} /> Export</span>
          {!busy && <button className="syn-close" onClick={onClose} title="Close"><X size={16} /></button>}
        </div>

        <div className="exp-body">
          <div className="exp-section">
            <div className="exp-label">Content</div>
            <div className="exp-seg">
              {CONTENT.map(({ id, label, icon: Ico, need }) => (
                <button
                  key={id}
                  className={`exp-seg-btn ${content === id ? 'on' : ''}`}
                  disabled={need && !hasVideo}
                  title={need && !hasVideo ? 'Add a Video track + clip to export video' : label}
                  onClick={() => setContent(id)}
                >
                  <Ico size={15} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`exp-section ${isAudioOnly ? 'dim' : ''}`}>
            <div className="exp-label">Resolution</div>
            <select className="exp-select" value={resLabel} disabled={isAudioOnly} onChange={(e) => setResLabel(e.target.value)}>
              {RES_PRESETS.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
            </select>
          </div>

          <div className={`exp-row ${isAudioOnly ? 'dim' : ''}`}>
            <div className="exp-section">
              <div className="exp-label">Frame rate</div>
              <select className="exp-select" value={fps} disabled={isAudioOnly} onChange={(e) => setFps(parseInt(e.target.value, 10))}>
                {FPS_PRESETS.map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </div>
            <div className="exp-section">
              <div className="exp-label">Format</div>
              <select className="exp-select" value={isAudioOnly ? 'wav' : format} disabled={isAudioOnly} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {isAudioOnly ? <option value="wav">WAV</option> : FORMAT_PRESETS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div className="exp-section">
              <div className="exp-label">Quality</div>
              <select className="exp-select" value={quality} disabled={isAudioOnly} onChange={(e) => setQuality(e.target.value as ExportQuality)}>
                {QUALITY_PRESETS.map((q) => <option key={q} value={q}>{q[0].toUpperCase() + q.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="exp-section">
            <label className="exp-label exp-rangehead">
              <input type="checkbox" checked={rangeOn} onChange={(e) => setRangeOn(e.target.checked)} /> Range (bars)
            </label>
            {rangeOn && (
              <div className="exp-row">
                <input className="exp-select" type="number" min={0} max={bars - 1} value={lo} title="Start bar" onChange={(e) => setStartBar(Math.max(0, parseInt(e.target.value, 10) || 0))} />
                <input className="exp-select" type="number" min={1} max={bars} value={hi} title="End bar" onChange={(e) => setEndBar(Math.min(bars, parseInt(e.target.value, 10) || bars))} />
                <span className="exp-rangelen">{fmtBars((hi - lo) * secPerBar)}</span>
              </div>
            )}
          </div>

          <p className="exp-note">
            {isAudioOnly
              ? `Renders the song mixdown to a WAV file${rangeOn ? ` (bars ${lo}–${hi})` : ''}.`
              : `Encodes ${format === 'webm' ? 'a .webm (VP9 + Opus)' : 'a standard .mp4 (H.264 + AAC)'} with WebCodecs — GPU-accelerated${format === 'mp4' ? ', uploadable to YouTube' : ''}. Audio is the song mixdown.`}
          </p>

          {busy && (
            <div className="exp-progress">
              <div className="exp-bar"><div className="exp-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <span className="exp-phase"><Loader size={12} className="spin" /> {phase || 'Working…'}</span>
            </div>
          )}
        </div>

        <div className="exp-foot">
          <button className="exp-secondary" disabled={busy} onClick={onExportProject} title="Portable project file with audio embedded (base64)">
            <FileJson size={14} /> Export project (.json)
          </button>
          <button className="exp-primary" disabled={busy} onClick={run}>
            {busy ? <><Loader size={14} className="spin" /> Exporting…</> : <><Download size={14} /> Export</>}
          </button>
        </div>
      </div>
    </div>
  );
}
