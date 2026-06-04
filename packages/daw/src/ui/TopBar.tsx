import React from 'react';
import { Play, Pause, Square, Circle, SkipBack, Grid3x3, Music2, SlidersHorizontal, PanelLeft, Save, FolderOpen, Settings, Piano, Check } from 'lucide-react';

export type ViewId = 'tracks' | 'live' | 'mix';

const TABS: [ViewId, string, React.ComponentType<any>][] = [
  ['tracks', 'Tracks', Grid3x3],
  ['live', 'Live', Piano],
  ['mix', 'Mixer', SlidersHorizontal],
];

export function TopBar({
  view, setView, isPlaying, onPlay, onStop, armed, onArm, bpm, onBpm, position, browserOpen, setBrowserOpen,
  projectName, onProjectName, onSave, saved, songs, onOpenSong,
}: {
  view: ViewId;
  setView: (v: ViewId) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  armed: boolean;
  onArm: () => void;
  bpm: number;
  onBpm: (v: number) => void;
  position: string;
  browserOpen: boolean;
  setBrowserOpen: (v: boolean) => void;
  projectName: string;
  onProjectName: (v: string) => void;
  onSave: () => void;
  saved: boolean;
  onOpenSong: () => void;
}) {
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
        <button className="icon-btn" title="Open song (choose a .json from the songs folder)" onClick={onOpenSong}><FolderOpen size={16} /></button>
      </div>

      <div className="viewtabs">
        {TABS.map(([id, label, Ico]) => (
          <button key={id} className={`vtab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
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
          <div className="t-sep" />
          <span className="t-pos">{position}</span>
          <div className="t-sep" />
          <label className="t-tempo">
            <input type="number" min={40} max={300} value={bpm} onChange={(e) => onBpm(Math.max(40, Math.min(300, parseInt(e.target.value, 10) || bpm)))} />
            <span>Tempo</span>
          </label>
        </div>
      </div>

      <div className="tb-tools">
        <span className="tb-status">{isPlaying ? 'Playing' : 'Stopped'}</span>
        <button className={`icon-btn ${browserOpen ? 'active' : ''}`} title="Browser" onClick={() => setBrowserOpen(!browserOpen)}><PanelLeft size={18} /></button>
        <button className={`icon-btn ${saved ? 'saved' : ''}`} title="Save song" onClick={onSave}>{saved ? <Check size={18} /> : <Save size={18} />}</button>
        <button className="icon-btn" title="Settings"><Settings size={18} /></button>
      </div>
    </div>
  );
}
