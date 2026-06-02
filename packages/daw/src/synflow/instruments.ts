// Generators for simple instrument flows (portable @synflow/core flow JSON).
// They mirror the known-good ADSR + Oscillator pattern, triggered by a Command-In
// node so the DAW drives them via engine.command('trigger', …).

export type Flow = { nodes: any[]; edges: any[] };

export interface SynthOpts {
  frequency?: number;
  type?: OscillatorType;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

/** A one-shot/gated subtractive voice: Command-In → ADSR → Gain; Osc → Gain → Master. */
export function makeBasicSynth(opts: SynthOpts = {}): Flow {
  const cmd = 'cmd.CommandInFlowNode';
  const osc = 'osc.OscillatorFlowNode';
  const adsr = 'adsr.ADSRFlowNode';
  const gain = 'gain.GainFlowNode';
  const master = 'master.MasterOutFlowNode';

  const nodes = [
    { id: cmd, type: 'CommandInFlowNode', data: { commandName: 'trigger', kind: 'note' } },
    { id: osc, type: 'OscillatorFlowNode', data: { frequency: opts.frequency ?? 220, type: opts.type ?? 'sine' } },
    {
      id: adsr, type: 'ADSRFlowNode',
      data: {
        attackTime: opts.attack ?? 0.005,
        decayTime: opts.decay ?? 0.18,
        sustainLevel: opts.sustain ?? 0.0,
        releaseTime: opts.release ?? 0.06,
        maxTime: 10, minPercent: 0, maxPercent: 100,
      },
    },
    { id: gain, type: 'GainFlowNode', data: { gain: 1 } },
    { id: master, type: 'MasterOutFlowNode', data: {} },
  ];
  const edges = [
    { id: 'e-cmd-adsr', source: cmd, target: adsr, sourceHandle: 'main-output', targetHandle: 'main-input' },
    { id: 'e-adsr-gain', source: adsr, target: gain, sourceHandle: 'output', targetHandle: 'gain' },
    { id: 'e-osc-gain', source: osc, target: gain, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'e-gain-master', source: gain, target: master, sourceHandle: 'output', targetHandle: 'destination-input' },
  ];
  return { nodes, edges };
}

/** A short, low, pitch-less-ish blip that reads as a kick on a step grid. */
export function makeKick(): Flow {
  return makeBasicSynth({ frequency: 60, type: 'sine', attack: 0.001, decay: 0.22, release: 0.02 });
}

/** A bright short blip (hat-ish). */
export function makeBlip(frequency = 880): Flow {
  return makeBasicSynth({ frequency, type: 'square', attack: 0.001, decay: 0.05, release: 0.02 });
}
