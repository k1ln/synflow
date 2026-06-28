import React from 'react';
import { Play, Pause, Square, Circle, SkipBack, Grid3x3, Layers, SlidersHorizontal, PanelLeft, Save, FolderOpen, FilePlus, Settings, Piano, Check, Download, FileAudio, Loader, Camera, ScreenShare, Mic, Disc, Undo2, Redo2 } from 'lucide-react';

export type ViewId = 'tracks' | 'song' | 'live' | 'mix';

const TABS: [ViewId, string, React.ComponentType<any>][] = [
  ['song', 'Arrangement', Layers],
  ['tracks', 'Tracks', Grid3x3],
  ['live', 'Live', Piano],
  ['mix', 'Mixer', SlidersHorizontal],
];

export function TopBar({
  view, setView, isPlaying, onPlay, onStop, armed, onArm, metronome, onToggleMetronome, bpm, onBpm, swing, onSwing, position, browserOpen, setBrowserOpen,
  projectName, onProjectName, onNewSong, onSave, saved, onOpenSong, onExport, exporting, exportProgress, onBounce, bouncing, bounceProgress,
  canUndo, canRedo, onUndo, onRedo,
  cameraOn, onToggleCamera, screenOn, onToggleScreen, micOn, onToggleMic, recording, onToggleRecord,
  midiConnected, midiTitle,
}: {
  view: ViewId;
  setView: (v: ViewId) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  armed: boolean;
  onArm: () => void;
  metronome: boolean;
  onToggleMetronome: () => void;
  bpm: number;
  onBpm: (v: number) => void;
  swing: number;
  onSwing: (v: number) => void;
  position: string;
  browserOpen: boolean;
  setBrowserOpen: (v: boolean) => void;
  projectName: string;
  onProjectName: (v: string) => void;
  onNewSong: () => void;
  onSave: () => void;
  saved: boolean;
  onOpenSong: () => void;
  onExport: () => void;
  exporting: boolean;
  exportProgress: number;
  onBounce: () => void;
  bouncing: boolean;
  bounceProgress: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  cameraOn: boolean;
  onToggleCamera: () => void;
  screenOn: boolean;
  onToggleScreen: () => void;
  micOn: boolean;
  onToggleMic: () => void;
  recording: boolean;
  onToggleRecord: () => void;
  midiConnected: boolean;
  midiTitle: string;
}) {
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  return (
    <div className="topbar">
      <div className="brand">
        <img src="/mark.svg" alt="" className="brand-mark" />
        <span className="brand-word">MOTHSCILLA</span>
      </div>
      <div className="tb-divider" />
      <div className="project">
        <span className="project-pill">Song</span>
        <input className="project-name-input" value={projectName} onChange={(e) => onProjectName(e.target.value)} spellCheck={false} title="Song name" />
        <button className="icon-btn" title="New song (fresh project, saved to the songs folder)" onClick={onNewSong}><FilePlus size={16} /></button>
        <button className="icon-btn" title="Open song (choose a .json from the songs folder)" onClick={onOpenSong}><FolderOpen size={16} /></button>
        <button className={`icon-btn ${saved ? 'saved' : ''}`} title="Save song (audio stays on disk, streamed)" onClick={onSave}>{saved ? <Check size={16} /> : <Save size={16} />}</button>
        <div className="tb-divider" />
        <button className="icon-btn" title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo}><Redo2 size={16} /></button>
      </div>

      <div className="viewtabs">
        {TABS.map(([id, label, Ico]) => (
          <button key={id} className={`vtab ${view === id ? 'active' : ''}`} title={`${label} view`} onClick={() => setView(id)}>
            <Ico size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="transport-wrap">
        <div className="transport">
          <button className="t-btn" title="Return to start" onClick={onStop}><SkipBack size={16} /></button>
          <button className={`t-btn play ${isPlaying ? 'on' : ''}`} title={isPlaying ? 'Pause' : 'Play'} onClick={onPlay}>
            {isPlaying ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button className="t-btn" title="Stop" onClick={onStop}><Square size={15} /></button>
          <button className={`t-btn rec ${armed ? 'on' : ''}`} title="Record arm" onClick={onArm}><Circle size={14} /></button>
          <button className={`t-btn metro ${metronome ? 'on' : ''}`} title={metronome ? 'Metronome on' : 'Metronome (click track)'} onClick={onToggleMetronome}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 14 L7 2.5 H9 L11 14 Z" /><line x1="3.5" y1="14" x2="12.5" y2="14" /><line x1="8" y1="11" x2="11" y2="5" />
            </svg>
          </button>
          <div className="t-sep" />
          <span className="t-pos">{position}</span>
          <div className="t-sep" />
          <label className="t-tempo">
            <input type="number" min={40} max={300} value={bpm} onChange={(e) => onBpm(Math.max(40, Math.min(300, parseInt(e.target.value, 10) || bpm)))} />
            <span>Tempo</span>
          </label>
          <label className="t-tempo t-swing" title="Swing: delays off-beat 16ths for groove (0 = straight)">
            <input type="number" min={0} max={100} step={1} value={Math.round((swing ?? 0) * 100)} onChange={(e) => onSwing(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100)} />
            <span>Swing %</span>
          </label>
        </div>
      </div>

      <div className="tb-tools">
        {midiConnected && <span className="midi-chip" title={midiTitle}><Piano size={13} /> MIDI</span>}
        <span className="tb-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
        <button className={`icon-btn ${cameraOn ? 'active' : ''}`} title="Webcam (reaction cam in the corner)" onClick={onToggleCamera}><Camera size={18} /></button>
        <button className={`icon-btn ${screenOn ? 'active' : ''}`} title="Capture screen / window / tab" onClick={onToggleScreen}><ScreenShare size={18} /></button>
        <button className={`icon-btn ${micOn ? 'active' : ''}`} title={micOn ? 'Microphone on (recorded with the program)' : 'Enable microphone (records with screen / webcam)'} onClick={onToggleMic}><Mic size={18} /></button>
        <button className={`icon-btn cap-rec ${recording ? 'on' : ''}`} title={recording ? 'Stop recording' : 'Record the program (screen + webcam + mic) to a clip'} onClick={onToggleRecord}><Disc size={18} /></button>
        <div className="tb-divider" />
        <button className={`icon-btn ${browserOpen ? 'active' : ''}`} title="Browser" onClick={() => setBrowserOpen(!browserOpen)}><PanelLeft size={18} /></button>
        <button className={`icon-btn ${exporting ? 'busy' : ''}`} title="Export portable song (.json with audio embedded as base64)" onClick={onExport} disabled={exporting}>
          {exporting ? <><Loader size={16} className="spin" /><span className="btn-pct">{pct(exportProgress)}</span></> : <Download size={18} />}
        </button>
        <button className={`icon-btn ${bouncing ? 'busy' : ''}`} title="Bounce song to WAV (offline, faster than realtime)" onClick={onBounce} disabled={bouncing}>
          {bouncing ? <><Loader size={16} className="spin" /><span className="btn-pct">{pct(bounceProgress)}</span></> : <FileAudio size={18} />}
        </button>
        <button className="icon-btn" title="Settings (coming soon)"><Settings size={18} /></button>
      </div>
    </div>
  );
}
