import type { Flow } from '../synflow/instruments';
import { makeKick, makeBlip, makeBasicSynth } from '../synflow/instruments';

/** A channel-rack row: an instrument flow + its step pattern. */
export interface Channel {
  id: string;
  name: string;
  flow: Flow;
  steps: boolean[];      // length === project.totalSteps
  /** Optional note the step triggers (for melodic channels). */
  note?: { frequency: number };
  muted?: boolean;
}

export interface Project {
  bpm: number;
  stepsPerBeat: number;  // 4 = 16th grid
  totalSteps: number;    // e.g. 16
  channels: Channel[];
}

const steps = (n: number, on: number[] = []): boolean[] =>
  Array.from({ length: n }, (_, i) => on.includes(i));

/** A default 16-step kit so there's something to hear immediately. */
export function defaultProject(): Project {
  const total = 16;
  return {
    bpm: 120,
    stepsPerBeat: 4,
    totalSteps: total,
    channels: [
      { id: 'kick', name: 'Kick', flow: makeKick(), steps: steps(total, [0, 4, 8, 12]) },
      { id: 'snare', name: 'Snare', flow: makeBasicSynth({ frequency: 180, type: 'triangle', decay: 0.12 }), steps: steps(total, [4, 12]) },
      { id: 'hat', name: 'Hat', flow: makeBlip(1200), steps: steps(total, [2, 6, 10, 14]) },
      { id: 'synth', name: 'Synth', flow: makeBasicSynth({ frequency: 330, type: 'sawtooth', decay: 0.25 }), steps: steps(total, [0, 7, 10]), note: { frequency: 330 } },
    ],
  };
}
