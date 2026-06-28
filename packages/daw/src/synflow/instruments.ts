// Generators for instrument flows (portable @synflow/core flow JSON).
// Trigger nodes are tagged `data.isTrigger` (+ optional `triggerHandle`); the DAW
// drives them by injecting receiveNodeOn / receiveNodeOff (see InstrumentHost),
// which is how synflow nodes are triggered internally.

export type Flow = { nodes: any[]; edges: any[] };

export interface SynthOpts {
  frequency?: number;
  type?: OscillatorType;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

/** Subtractive voice: ADSR(trigger) → Gain.gain; Osc → Gain → Master. */
export function makeBasicSynth(opts: SynthOpts = {}): Flow {
  const osc = 'osc.OscillatorFlowNode';
  const adsr = 'adsr.ADSRFlowNode';
  const gain = 'gain.GainFlowNode';
  const master = 'master.MasterOutFlowNode';

  const nodes = [
    { id: osc, type: 'OscillatorFlowNode', data: { frequency: opts.frequency ?? 220, type: opts.type ?? 'sine' } },
    {
      id: adsr, type: 'ADSRFlowNode', isTrigger: true,
      data: {
        attackTime: opts.attack ?? 0.005, decayTime: opts.decay ?? 0.18,
        sustainLevel: opts.sustain ?? 0.0, releaseTime: opts.release ?? 0.06,
        maxTime: 10, minPercent: 0, maxPercent: 100, isTrigger: true,
      },
    },
    { id: gain, type: 'GainFlowNode', data: { gain: 1 } },
    { id: master, type: 'MasterOutFlowNode', data: {} },
  ];
  const edges = [
    { id: 'e-adsr-gain', source: adsr, target: gain, sourceHandle: 'output', targetHandle: 'gain' },
    { id: 'e-osc-gain', source: osc, target: gain, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'e-gain-master', source: gain, target: master, sourceHandle: 'output', targetHandle: 'destination-input' },
  ];
  return { nodes, edges };
}

/** Punchy kick: amp envelope on Gain + pitch envelope on the oscillator frequency. */
export function makeKick(): Flow {
  const osc = 'osc.OscillatorFlowNode';
  const amp = 'amp.ADSRFlowNode';
  const pitch = 'pitch.ADSRFlowNode';
  const gain = 'gain.GainFlowNode';
  const master = 'master.MasterOutFlowNode';

  const nodes = [
    { id: osc, type: 'OscillatorFlowNode', data: { frequency: 140, type: 'sine' } },
    { id: amp, type: 'ADSRFlowNode', data: { attackTime: 0.001, decayTime: 0.30, sustainLevel: 0.0, releaseTime: 0.02, maxTime: 10, minPercent: 0, maxPercent: 100, isTrigger: true } },
    { id: pitch, type: 'ADSRFlowNode', data: { attackTime: 0.001, decayTime: 0.08, sustainLevel: 0.32, releaseTime: 0.02, maxTime: 10, minPercent: 30, maxPercent: 100, isTrigger: true } },
    { id: gain, type: 'GainFlowNode', data: { gain: 1 } },
    { id: master, type: 'MasterOutFlowNode', data: {} },
  ];
  const edges = [
    { id: 'k-amp-gain', source: amp, target: gain, sourceHandle: 'output', targetHandle: 'gain' },
    { id: 'k-pitch-osc', source: pitch, target: osc, sourceHandle: 'output', targetHandle: 'frequency' },
    { id: 'k-osc-gain', source: osc, target: gain, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'k-gain-master', source: gain, target: master, sourceHandle: 'output', targetHandle: 'destination-input' },
  ];
  return { nodes, edges };
}

/** Bright short blip (hat-ish). */
export function makeBlip(frequency = 880): Flow {
  return makeBasicSynth({ frequency, type: 'square', attack: 0.001, decay: 0.05, release: 0.02 });
}
