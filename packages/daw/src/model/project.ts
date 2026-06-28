import type { Flow } from '../synflow/instruments';
import { makeKick, makeBlip, makeBasicSynth, makeSynthVoice } from '../synflow/instruments';

/** A note in a piano-roll instrument; start/length are in grid steps. */
export interface PianoNote {
  id: number;
  midi: number;
  start: number;
  length: number;
}

/** One instrument inside a track (a synflow flow + its step/piano content). */
export interface Instrument {
  id: string;
  name: string;
  flow: Flow;
  kind: 'step' | 'piano';
  steps: boolean[];        // step instruments
  notes?: PianoNote[];     // piano instruments
  voices?: number;         // polyphony (piano)
  muted?: boolean;
}

/**
 * An automation lane drives one param over the pattern via @synflow/core.
 * target: an instrument param (instrumentId set) or a track FX param (fxIndex set).
 */
export interface AutomationLane {
  id: string;
  instrumentId?: string;   // automate a param of this instrument
  fxIndex?: number;        // ...or of this track-FX insert
  nodeId: string;          // param's node id within that flow
  param: string;           // e.g. 'frequency', 'gain'
  min: number;
  max: number;
  values: (number | null)[]; // per step; null = hold previous
}

/** A track: a group of instruments routed through one FX chain + volume, with automation. */
export interface Track {
  id: string;
  name: string;
  volume: number;
  fx: string[];                  // FX_LIBRARY ids (track insert chain)
  instruments: Instrument[];
  automation: AutomationLane[];
}

export interface Project {
  bpm: number;
  stepsPerBeat: number;
  totalSteps: number;
  tracks: Track[];
}

const steps = (n: number, on: number[] = []): boolean[] =>
  Array.from({ length: n }, (_, i) => on.includes(i));

let _id = 0;
export const uid = (p: string): string => `${p}-${++_id}-${Math.random().toString(36).slice(2, 7)}`;
let _noteId = 1000;
export const newNoteId = (): number => ++_noteId;

/** Default project: a Drums track (step instruments) + a Synth track (piano + FX + automation). */
export function defaultProject(): Project {
  const total = 16;
  const sweep: (number | null)[] = Array.from({ length: total }, (_, i) => 300 + Math.round((Math.sin((i / total) * Math.PI * 2) * 0.5 + 0.5) * 3000));
  return {
    bpm: 120,
    stepsPerBeat: 4,
    totalSteps: total,
    tracks: [
      {
        id: 'drums', name: 'Drums', volume: 0.8, fx: [], automation: [],
        instruments: [
          { id: 'kick', name: 'Kick', kind: 'step', flow: makeKick(), steps: steps(total, [0, 4, 8, 12]) },
          { id: 'snare', name: 'Snare', kind: 'step', flow: makeBasicSynth({ frequency: 180, type: 'triangle', decay: 0.12 }), steps: steps(total, [4, 12]) },
          { id: 'hat', name: 'Hat', kind: 'step', flow: makeBlip(1200), steps: steps(total, [2, 6, 10, 14]) },
        ],
      },
      {
        id: 'synth', name: 'Synth', volume: 0.8, fx: ['lowpass'],
        instruments: [
          {
            id: 'lead', name: 'Lead', kind: 'piano', flow: makeSynthVoice('sawtooth'), steps: [], voices: 6,
            notes: [
              { id: 1, midi: 60, start: 0, length: 4 },
              { id: 2, midi: 63, start: 4, length: 4 },
              { id: 3, midi: 67, start: 8, length: 8 },
            ],
          },
        ],
        // A filter-cutoff sweep on the track's lowpass FX.
        automation: [
          { id: 'a1', fxIndex: 0, nodeId: 'filt.BiquadFilterFlowNode', param: 'frequency', min: 200, max: 5000, values: sweep },
        ],
      },
    ],
  };
}
