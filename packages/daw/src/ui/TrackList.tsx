import React from 'react';
import type { Project } from '../model/project';
import { FX_LIBRARY } from '../synflow/effects';
import { StepGrid } from './StepGrid';
import { PianoRoll } from './PianoRoll';
import { AutomationLane } from './AutomationLane';

export interface TrackHandlers {
  onVolume: (trackId: string, v: number) => void;
  onAddFx: (trackId: string, fxId: string) => void;
  onRemoveFx: (trackId: string, index: number) => void;
  onAddInstrument: (trackId: string, kind: 'step' | 'piano') => void;
  onAddSample: (trackId: string) => void;
  onToggleStep: (instrumentId: string, step: number) => void;
  onMute: (instrumentId: string) => void;
  onAddNote: (instrumentId: string, midi: number, start: number) => void;
  onRemoveNote: (instrumentId: string, noteId: number) => void;
  onAddAutomation: (trackId: string) => void;
  onSetAutomation: (laneId: string, step: number, value: number) => void;
  onAddTrack: () => void;
}

export function TrackList({
  project, currentStep, noteLength, h,
}: {
  project: Project;
  currentStep: number;
  noteLength: number;
  h: TrackHandlers;
}) {
  return (
    <div className="tracks">
      {project.tracks.map((track) => (
        <div className="track" key={track.id}>
          <div className="track-head">
            <span className="track-name">{track.name}</span>
            <input className="track-vol" type="range" min={0} max={1} step={0.01} value={track.volume}
              onChange={(e) => h.onVolume(track.id, parseFloat(e.target.value))} title="track volume" />
            <div className="track-fx">
              {track.fx.map((fxId, i) => {
                const def = FX_LIBRARY.find((f) => f.id === fxId);
                return <button key={i} className="fx-chip" onClick={() => h.onRemoveFx(track.id, i)} title="remove">{def?.name ?? fxId} ✕</button>;
              })}
              <select className="fx-add" value="" onChange={(e) => { if (e.target.value) h.onAddFx(track.id, e.target.value); }}>
                <option value="">+ FX</option>
                {FX_LIBRARY.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="track-add">
              <button onClick={() => h.onAddInstrument(track.id, 'step')}>+ Drum</button>
              <button onClick={() => h.onAddInstrument(track.id, 'piano')}>+ Synth</button>
              <button onClick={() => h.onAddSample(track.id)}>+ Sample</button>
              <button onClick={() => h.onAddAutomation(track.id)}>+ Auto</button>
            </div>
          </div>
          <div className="track-body">
            {track.instruments.filter((i) => i.kind === 'step').map((inst) => (
              <StepGrid key={inst.id} instrument={inst} totalSteps={project.totalSteps} stepsPerBeat={project.stepsPerBeat}
                currentStep={currentStep} onToggle={h.onToggleStep} onMute={h.onMute} />
            ))}
            {track.instruments.filter((i) => i.kind === 'piano').map((inst) => (
              <PianoRoll key={inst.id} instrument={inst} totalSteps={project.totalSteps} stepsPerBeat={project.stepsPerBeat}
                currentStep={currentStep} noteLength={noteLength} onAddNote={h.onAddNote} onRemoveNote={h.onRemoveNote} />
            ))}
            {track.automation.map((lane) => {
              const label = lane.fxIndex != null
                ? `FX ${lane.fxIndex + 1} · ${lane.param}`
                : `${track.instruments.find((i) => i.id === lane.instrumentId)?.name ?? ''} · ${lane.param}`;
              return <AutomationLane key={lane.id} lane={lane} label={label} totalSteps={project.totalSteps} currentStep={currentStep} onSet={h.onSetAutomation} />;
            })}
          </div>
        </div>
      ))}
      <button className="add-track" onClick={h.onAddTrack}>+ Track</button>
    </div>
  );
}
