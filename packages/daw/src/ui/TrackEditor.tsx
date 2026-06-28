import React, { useState } from 'react';
import { Plus, Trash2, Repeat } from 'lucide-react';
import type { Project, Track } from '../model/project';
import { StepGrid } from './StepGrid';
import { PianoRoll } from './PianoRoll';
import { FxBar } from './FxBar';
import type { LibraryEntry } from '../synflow/library';

export interface TrackEditorHandlers {
  onToggleStep: (useId: string, step: number) => void;
  onMuteUse: (useId: string) => void;
  onAddNote: (useId: string, midi: number, start: number) => void;
  onRemoveNote: (useId: string, noteId: number) => void;
  onAddUse: (poolId: string) => void;
  onRemoveUse: (useId: string) => void;
  onUseFxAdd: (useId: string, fxId: string) => void;
  onUseFxRemove: (useId: string, index: number) => void;
  onUseFxEdit: (useId: string, index: number) => void;
  onTrackFxAdd: (fxId: string) => void;
  onTrackFxRemove: (index: number) => void;
  onTrackFxEdit: (index: number) => void;
  onUseFxKnob: (useId: string, index: number, nodeId: string, param: string, value: number) => void;
  onTrackFxKnob: (index: number, nodeId: string, param: string, value: number) => void;
  onRename: (name: string) => void;
  onToggleLoop: () => void;
  onSetLength: (length: number) => void;
  onSetVoices: (useId: string, voices: number) => void;
}

export function TrackEditor({ project, track, effects, currentStep, h }: {
  project: Project;
  track: Track;
  effects: LibraryEntry[];
  currentStep: number;
  h: TrackEditorHandlers;
}) {
  const [picking, setPicking] = useState(false);
  const poolName = (id: string) => project.pool.find((p) => p.id === id)?.name ?? '?';
  const addable = project.pool.filter((p) => (track.type === 'drums' ? p.kind === 'drum' : p.kind === 'synth'));
  const T = track.length, S = project.stepsPerBeat;
  const cs = currentStep < 0 ? -1 : currentStep % track.length; // per-track playhead

  return (
    <div className="trackeditor">
      <div className="te-head">
        <input className="te-name" value={track.name} onChange={(e) => h.onRename(e.target.value)} spellCheck={false} />
        <span className={`te-type ${track.type}`}>{track.type}</span>
        <button className={`te-loop ${track.loop ? 'on' : ''}`} onClick={h.onToggleLoop} title={track.loop ? 'Looping (click to stop)' : 'Loop this track'}><Repeat size={13} /> loop</button>
        <label className="te-length" title="Pattern length (steps)">len
          <select value={track.length} onChange={(e) => h.onSetLength(parseInt(e.target.value, 10))}>
            {[4, 8, 12, 16, 24, 32, 48, 64].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="te-add">
          <button className="te-addbtn" onClick={() => setPicking((p) => !p)}><Plus size={14} /> add {track.type === 'drums' ? 'drum' : 'synth'}</button>
          {picking && (
            <div className="te-menu" onMouseLeave={() => setPicking(false)}>
              {addable.length === 0 && <span className="te-none">no {track.type === 'drums' ? 'drums' : 'synths'} in pool</span>}
              {addable.map((p) => <button key={p.id} onClick={() => { h.onAddUse(p.id); setPicking(false); }}>{p.name}</button>)}
            </div>
          )}
        </div>
      </div>

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

      <FxBar
        label="Track FX" fx={track.fx} effects={effects}
        onAdd={h.onTrackFxAdd} onRemove={h.onTrackFxRemove} onEdit={h.onTrackFxEdit} onKnob={h.onTrackFxKnob}
      />
    </div>
  );
}
