import React, { useState } from 'react';
import { Plus, Sparkles, Trash2, Repeat, Upload, Mic, Square, FolderOpen, Volume2 } from 'lucide-react';
import type { Project, Track, AudioClip, AudioAsset } from '../model/project';
import { StepGrid } from './StepGrid';
import { PianoRoll } from './PianoRoll';
import { AudioTrackLane } from './AudioTrackLane';
import { FxBar } from './FxBar';
import { AutomationLaneRow } from './AutomationLaneRow';
import { flowKnobs } from '../synflow/knobs';
import { findEntry, type LibraryEntry } from '../synflow/library';

/** A parameter a track automation lane can target (volume or a track-FX knob). */
export interface AutoTarget { key: string; label: string; nodeId: string; param: string; min: number; max: number; fxIndex?: number }

/** seconds → m:ss (or h:mm:ss past an hour) for the clip-length hint. */
const fmtDur = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

export interface TrackEditorHandlers {
  onToggleStep: (useId: string, step: number) => void;
  onMuteUse: (useId: string) => void;
  onAddNote: (useId: string, midi: number, start: number) => void;
  onRemoveNote: (useId: string, noteId: number) => void;
  onMoveNote: (useId: string, noteId: number, midi: number, start: number) => void;
  onResizeNote: (useId: string, noteId: number, length: number) => void;
  onSetVelocity: (useId: string, noteId: number, velocity: number) => void;
  onQuantize: (useId: string, gridSteps: number) => void;
  onTranspose: (useId: string, semitones: number) => void;
  onHumanize: (useId: string) => void;
  onSetKey: (key: import('../model/project').MusicalKey | null) => void;
  onAddChord: (useId: string, midis: number[], start: number) => void;
  onAddAutomation: (trackId: string, target: AutoTarget) => void;
  onPaintAutomation: (trackId: string, laneId: string, step: number, value: number) => void;
  onRemoveAutomation: (trackId: string, laneId: string) => void;
  onPlayNote: (useId: string, midi: number) => void;
  onKeyDown: (useId: string, midi: number) => void;
  onKeyUp: (useId: string, midi: number) => void;
  onAddUse: (poolId: string) => void;
  onCreateUse: () => void;
  onRemoveUse: (useId: string) => void;
  onUseFxAdd: (useId: string, fxId: string) => void;
  onUseFxRemove: (useId: string, index: number) => void;
  onUseFxEdit: (useId: string, index: number) => void;
  onTrackFxAdd: (fxId: string) => void;
  onTrackFxRemove: (index: number) => void;
  onTrackFxEdit: (index: number) => void;
  onUseFxKnob: (useId: string, index: number, nodeId: string, param: string, value: number | string) => void;
  onTrackFxKnob: (index: number, nodeId: string, param: string, value: number | string) => void;
  onRename: (name: string) => void;
  onToggleLoop: () => void;
  onSetLength: (length: number) => void;
  onSetVoices: (useId: string, voices: number) => void;
  onTrackVolume: (trackId: string, v: number) => void;
  onImportAudio: (trackId: string) => void;
  onAddClipFromAsset: (trackId: string, asset: AudioAsset) => void;
  onOpenLibrary: () => void; // refresh the shared audio library before showing the picker
  onStartRec: (trackId: string) => void;
  onStopRec: () => void;
  onMoveAudioClip: (trackId: string, clipId: string, start: number) => void;
  onTrimAudioClip: (trackId: string, clipId: string, offset: number, duration: number) => void;
  onSplitAudioClip: (trackId: string, clipId: string, atSteps: number) => void;
  onRemoveAudioClip: (trackId: string, clipId: string) => void;
  onAudioClipGain: (trackId: string, clipId: string, gain: number) => void;
  onNormalizeAudioClip: (trackId: string, clipId: string) => void;
  onFadeAudioClip: (trackId: string, clipId: string, fadeIn: number, fadeOut: number) => void;
  onPlayAudioClip: (clip: AudioClip) => void;
}

export function TrackEditor({ project, track, effects, currentStep, recTrack, previewKey, audioLibrary, h }: {
  project: Project;
  track: Track;
  effects: LibraryEntry[];
  currentStep: number;
  recTrack: string | null;
  previewKey: string | null;
  audioLibrary: AudioAsset[];
  h: TrackEditorHandlers;
}) {
  const [picking, setPicking] = useState(false);
  const [autoSel, setAutoSel] = useState('');
  const autoTargets: AutoTarget[] = [
    { key: 'vol', label: 'Volume', nodeId: '__volume__', param: 'volume', min: 0, max: 1 },
    ...track.fx.flatMap((ins, fxIndex) =>
      flowKnobs(ins.flow ?? findEntry(ins.fxId)?.flow).map((k) => ({ key: `${fxIndex}:${k.nodeId}:${k.param}`, label: `${ins.name}: ${k.label}`, nodeId: k.nodeId, param: k.param, min: k.min, max: k.max, fxIndex }))),
  ];
  const poolName = (id: string) => project.pool.find((p) => p.id === id)?.name ?? '?';
  const addable = project.pool.filter((p) => (track.type === 'drums' ? p.kind === 'drum' : p.kind === 'synth'));
  const T = track.length, S = project.stepsPerBeat;
  const cs = currentStep < 0 ? -1 : currentStep % track.length; // per-track playhead
  const isAudio = track.type === 'audio';
  const isRec = recTrack === track.id;

  return (
    <div className="trackeditor">
      <div className="te-head">
        <input className="te-name" value={track.name} onChange={(e) => h.onRename(e.target.value)} spellCheck={false} />
        <span className={`te-type ${track.type}`}>{track.type}</span>
        <label className="te-vol" title={`Track volume ${Math.round(track.volume * 100)}%`}>
          <Volume2 size={12} />
          <input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={(e) => h.onTrackVolume(track.id, parseFloat(e.target.value))} />
        </label>
        {isAudio ? (
          <>
            <button className="te-addbtn" onClick={() => h.onImportAudio(track.id)}><Upload size={13} /> import</button>
            <div className="te-add te-add-audio">
              <button className="te-addbtn" onClick={() => { if (!picking) h.onOpenLibrary(); setPicking((p) => !p); }} title="Add a clip from audio on disk (any song in this folder)"><FolderOpen size={13} /> from disk</button>
              {picking && (
                <div className="te-menu te-menu-lib" onMouseLeave={() => setPicking(false)}>
                  {audioLibrary.length === 0 && <span className="te-none">no audio on disk yet</span>}
                  {audioLibrary.map((a) => (
                    <button key={a.source.kind === 'disk' ? a.source.fileName : a.id} onClick={() => { h.onAddClipFromAsset(track.id, a); setPicking(false); }}>
                      <span className="te-menu-name">{a.name}</span><span className="te-menu-dur">{a.duration > 0 ? fmtDur(a.duration) : '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isRec
              ? <button className="te-addbtn rec" onClick={h.onStopRec}><Square size={13} /> stop</button>
              : <button className="te-addbtn" onClick={() => h.onStartRec(track.id)}><Mic size={13} /> record</button>}
          </>
        ) : (
          <>
            <button className={`te-loop ${track.loop ? 'on' : ''}`} onClick={h.onToggleLoop} title={track.loop ? 'Looping (click to stop)' : 'Loop this track'}><Repeat size={13} /> loop</button>
            <label className="te-length" title="Pattern length (steps)">len
              <input type="number" min={1} max={256} value={track.length} onChange={(e) => h.onSetLength(parseInt(e.target.value, 10) || 1)} />
            </label>
            <button className="te-addbtn" onClick={() => h.onCreateUse()} title={`Create a brand-new ${track.type === 'drums' ? 'drum' : 'synth'} in Synflow and add it here`}><Sparkles size={13} /> new {track.type === 'drums' ? 'drum' : 'synth'}</button>
            <div className="te-add">
              <button className="te-addbtn" onClick={() => setPicking((p) => !p)}><Plus size={14} /> add {track.type === 'drums' ? 'drum' : 'synth'}</button>
              {picking && (
                <div className="te-menu" onMouseLeave={() => setPicking(false)}>
                  {addable.length === 0 && <span className="te-none">no {track.type === 'drums' ? 'drums' : 'synths'} in pool</span>}
                  {addable.map((p) => <button key={p.id} onClick={() => { h.onAddUse(p.id); setPicking(false); }}>{p.name}</button>)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isAudio ? (
        <AudioTrackLane
          track={track} project={project} currentStep={currentStep} recording={isRec}
          previewKey={previewKey} onPlay={(clip) => h.onPlayAudioClip(clip)}
          onMove={(clipId, start) => h.onMoveAudioClip(track.id, clipId, start)}
          onTrim={(clipId, offset, duration) => h.onTrimAudioClip(track.id, clipId, offset, duration)}
          onSplit={(clipId, atSteps) => h.onSplitAudioClip(track.id, clipId, atSteps)}
          onRemove={(clipId) => h.onRemoveAudioClip(track.id, clipId)}
          onGain={(clipId, gain) => h.onAudioClipGain(track.id, clipId, gain)}
          onNormalize={(clipId) => h.onNormalizeAudioClip(track.id, clipId)}
          onFade={(clipId, fadeIn, fadeOut) => h.onFadeAudioClip(track.id, clipId, fadeIn, fadeOut)}
        />
      ) : (
      <div className="te-uses">
        {track.uses.length === 0 && <div className="te-empty">No instruments yet — add {track.type === 'drums' ? 'a drum' : 'a synth'} from the pool.</div>}
        {track.uses.map((use) => (
          <div className={`te-use ${track.type}`} key={use.id}>
            <div className="te-use-main">
              {track.type === 'drums' ? (
                <StepGrid
                  id={use.id} name={poolName(use.poolId)} steps={use.steps ?? []} muted={use.muted}
                  totalSteps={T} stepsPerBeat={S} currentStep={cs}
                  onToggle={h.onToggleStep} onMute={h.onMuteUse}
                />
              ) : (
                <div className="te-synth">
                  <div className="te-synth-head">
                    <span className="te-synth-name">{poolName(use.poolId)}</span>
                    <label className="te-voices" title="Polyphony — number of voices">
                      voices
                      <input type="number" min={1} max={16} value={use.voices ?? 1} onChange={(e) => h.onSetVoices(use.id, parseInt(e.target.value, 10) || 1)} />
                    </label>
                  </div>
                  <PianoRoll
                    id={use.id} name={poolName(use.poolId)} notes={use.notes ?? []} voices={use.voices}
                    totalSteps={T} stepsPerBeat={S} currentStep={cs}
                    onAddNote={h.onAddNote} onRemoveNote={h.onRemoveNote}
                    onMoveNote={h.onMoveNote} onResizeNote={h.onResizeNote} onSetVelocity={h.onSetVelocity} onPlayNote={h.onPlayNote} onQuantize={h.onQuantize}
                    onTranspose={h.onTranspose} onHumanize={h.onHumanize}
                    musicalKey={project.key} onSetKey={h.onSetKey} onAddChord={h.onAddChord}
                    onKeyDown={h.onKeyDown} onKeyUp={h.onKeyUp}
                  />
                </div>
              )}
              <button className="te-removeuse" title="Remove from track" onClick={() => h.onRemoveUse(use.id)}><Trash2 size={13} /></button>
            </div>
            <FxBar
              label="Instrument FX" color="var(--cat-mod)" fx={use.fx} effects={effects} compact
              onAdd={(fx) => h.onUseFxAdd(use.id, fx)} onRemove={(i) => h.onUseFxRemove(use.id, i)} onEdit={(i) => h.onUseFxEdit(use.id, i)}
              onKnob={(i, nodeId, param, v) => h.onUseFxKnob(use.id, i, nodeId, param, v)}
            />
          </div>
        ))}
      </div>
      )}

      <FxBar
        label="Track FX" fx={track.fx} effects={effects}
        onAdd={h.onTrackFxAdd} onRemove={h.onTrackFxRemove} onEdit={h.onTrackFxEdit} onKnob={h.onTrackFxKnob}
      />

      {(track.type === 'drums' || track.type === 'synth') && (
        <div className="te-automation">
          <div className="te-auto-head">
            <span className="fxbar-label">Automation</span>
            <select className="pr-qgrid" value={autoSel} onChange={(e) => setAutoSel(e.target.value)} title="Parameter to automate">
              <option value="">param…</option>
              {autoTargets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button className="pr-quant" disabled={!autoSel} title="Add automation lane" onClick={() => { const tgt = autoTargets.find((t) => t.key === autoSel); if (tgt) h.onAddAutomation(track.id, tgt); }}>＋ Lane</button>
          </div>
          {track.automation.map((lane) => (
            <div className="te-auto-lane" key={lane.id}>
              <span className="te-auto-name" title={`${lane.nodeId === '__volume__' ? 'Volume' : lane.param}`}>{lane.nodeId === '__volume__' ? 'Volume' : `${lane.param}`}</span>
              <AutomationLaneRow values={lane.values} min={lane.min} max={lane.max} onPaint={(step, value) => h.onPaintAutomation(track.id, lane.id, step, value)} />
              <button className="te-auto-x" title="Remove lane" onClick={() => h.onRemoveAutomation(track.id, lane.id)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
