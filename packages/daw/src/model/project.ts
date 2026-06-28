import type { Flow } from '../synflow/instruments';
import { makeKick, makeBlip, makeBasicSynth, makeSynthVoice } from '../synflow/instruments';

/** A note in a piano-roll channel; start/length are in grid steps. */
export interface PianoNote {
  id: number;
  midi: number;
  start: number;
  length: number;
}

export interface Channel {
  id: string;
  name: string;
  flow: Flow;
  kind: 'step' | 'piano';
  steps: boolean[];        // used by step channels
  notes?: PianoNote[];     // used by piano channels
  voices?: number;         // polyphony (piano channels)
  muted?: boolean;
}

export interface Project {
  bpm: number;
  stepsPerBeat: number;
  totalSteps: number;
  channels: Channel[];
}

const steps = (n: number, on: number[] = []): boolean[] =>
  Array.from({ length: n }, (_, i) => on.includes(i));

/** A default project: a drum kit (step channels) + a melodic synth (piano-roll). */
export function defaultProject(): Project {
  const total = 16;
  return {
    bpm: 120,
    stepsPerBeat: 4,
    totalSteps: total,
    channels: [
      { id: 'kick', name: 'Kick', kind: 'step', flow: makeKick(), steps: steps(total, [0, 4, 8, 12]) },
      { id: 'snare', name: 'Snare', kind: 'step', flow: makeBasicSynth({ frequency: 180, type: 'triangle', decay: 0.12 }), steps: steps(total, [4, 12]) },
      { id: 'hat', name: 'Hat', kind: 'step', flow: makeBlip(1200), steps: steps(total, [2, 6, 10, 14]) },
      {
        id: 'synth', name: 'Synth', kind: 'piano', flow: makeSynthVoice('sawtooth'), steps: [], voices: 6,
        notes: [
          { id: 1, midi: 60, start: 0, length: 4 },
          { id: 2, midi: 63, start: 4, length: 4 },
          { id: 3, midi: 67, start: 8, length: 8 },
        ],
      },
    ],
  };
}

let nextNoteId = 1000;
export const newNoteId = (): number => ++nextNoteId;
