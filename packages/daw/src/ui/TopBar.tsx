import React from 'react';
import { RecordControl, type RecordOpts } from './RecordControl';
import { ScreenRecordControl, type ScreenRecordOpts } from './ScreenRecordControl';
import { ExportMenu } from './ExportMenu';
import { Play, Pause, Square, Circle, SkipBack, Grid3x3, Layers, SlidersHorizontal, PanelLeft, Save, FolderOpen, FilePlus, Settings, Piano, Check, Undo2, Redo2, Film } from 'lucide-react';

export type ViewId = 'tracks' | 'song' | 'live' | 'video' | 'mix';

const TABS: [ViewId, string, React.ComponentType<any>][] = [
  ['song', 'Song', Layers],
  ['tracks', 'Tracks', Grid3x3],
  ['live', 'Live', Piano],
  ['video', 'Video', Film],
  ['mix', 'Mixer', SlidersHorizontal],
];

export function TopBar({
  view, setView, isPlaying, onPlay, onStop, armed, onArm, metronome, onToggleMetronome, bpm, onBpm, swing, onSwing, beatsPerBar, onTimeSig, position, browserOpen, setBrowserOpen,
  projectName, onProjectName, onNewSong, onSave, saved, onOpenSong, onExport, exporting, exportProgress, onBounce, bouncing, bounceProgress, onExportMidi, onExportStems,
  canUndo, canRedo, onUndo, onRedo,
  recording, onToggleRecord, recOpts, onRecOpts,
  screenRecording, onToggleScreenRecord, screenRecOpts, onScreenRecOpts,
  midiConnected, midiTitle, midiLearn, onMidiLearn,
  onOpenSettings,
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
  beatsPerBar: number;
  onTimeSig: (beatsPerBar: number) => void;
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
  onExportMidi: () => void;
  onExportStems: () => void;
  bouncing: boolean;
  bounceProgress: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  recOpts: RecordOpts;
  onRecOpts: (o: RecordOpts) => void;
  recording: boolean;
  onToggleRecord: () => void;
  screenRecOpts: ScreenRecordOpts;
  onScreenRecOpts: (o: ScreenRecordOpts) => void;
  screenRecording: boolean;
  onToggleScreenRecord: () => void;
  midiConnected: boolean;
  midiLearn: boolean;
  onMidiLearn: () => void;
  midiTitle: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="topbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}mark.svg`} alt="Mothscilla" className="brand-mark" />
      </div>
      <div className="tb-divider" />
      <div className="project">
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
          <RecordControl recording={recording} opts={recOpts} onOpts={onRecOpts} onToggle={onToggleRecord} />
          <ScreenRecordControl recording={screenRecording} opts={screenRecOpts} onOpts={onScreenRecOpts} onToggle={onToggleScreenRecord} />
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
          <label className="t-tempo t-swing" title="Time signature (beats per bar; quarter-note beats). Resizes the bar.">
            <span className="t-timesig"><input type="number" min={1} max={16} value={beatsPerBar} onChange={(e) => onTimeSig(Math.max(1, Math.min(16, parseInt(e.target.value, 10) || beatsPerBar)))} />/4</span>
            <span>Time</span>
          </label>
        </div>
      </div>

      <div className="tb-tools">
        {midiConnected && <span className="midi-chip" title={midiTitle}><Piano size={13} /> MIDI</span>}
        {midiConnected && <button className={`midi-learn ${midiLearn ? 'on' : ''}`} onClick={onMidiLearn}
          title={midiLearn ? 'Learning: touch a volume/pan fader in the DAW, then move a knob on your controller' : 'MIDI learn: map a hardware knob to a fader'}>learn</button>}
        <div className="tb-divider" />
        <button className={`icon-btn ${browserOpen ? 'active' : ''}`} title="Browser" onClick={() => setBrowserOpen(!browserOpen)}><PanelLeft size={18} /></button>
        <ExportMenu onExport={onExport} exporting={exporting} exportProgress={exportProgress}
          onBounce={onBounce} bouncing={bouncing} bounceProgress={bounceProgress}
          onExportMidi={onExportMidi} onExportStems={onExportStems} />
        <button className="icon-btn" title="Settings" onClick={onOpenSettings}><Settings size={18} /></button>
      </div>
    </div>
  );
}
