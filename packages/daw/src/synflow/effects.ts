import type { Flow } from './instruments';

// FX = @synflow/core flows with a tagged audio input (data.isInput) and output
// (data.isOutput). The DAW connects a channel's signal into the input and takes
// the output onward (see Mixer/ChannelStrip), chaining inserts.

/** Lowpass/highpass/etc. filter insert. */
export function makeFilterFx(opts: { type?: BiquadFilterType; frequency?: number; Q?: number } = {}): Flow {
  const inp = 'in.GainFlowNode';
  const filt = 'filt.BiquadFilterFlowNode';
  const out = 'out.GainFlowNode';
  const nodes = [
    { id: inp, type: 'GainFlowNode', data: { gain: 1, isInput: true } },
    { id: filt, type: 'BiquadFilterFlowNode', data: { filterType: opts.type ?? 'lowpass', frequency: opts.frequency ?? 1200, Q: opts.Q ?? 1 } },
    { id: out, type: 'GainFlowNode', data: { gain: 1, isOutput: true } },
  ];
  const edges = [
    { id: 'fx-in-filt', source: inp, target: filt, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'fx-filt-out', source: filt, target: out, sourceHandle: 'output', targetHandle: 'main-input' },
  ];
  return { nodes, edges };
}

/** Delay insert with a dry path (in → out) + a wet path (in → delay → out). */
export function makeDelayFx(opts: { delayTime?: number } = {}): Flow {
  const inp = 'in.GainFlowNode';
  const dly = 'dly.DelayFlowNode';
  const wet = 'wet.GainFlowNode';
  const out = 'out.GainFlowNode';
  const nodes = [
    { id: inp, type: 'GainFlowNode', data: { gain: 1, isInput: true } },
    { id: dly, type: 'DelayFlowNode', data: { delayTime: opts.delayTime ?? 250 } },
    { id: wet, type: 'GainFlowNode', data: { gain: 0.4 } },
    { id: out, type: 'GainFlowNode', data: { gain: 1, isOutput: true } },
  ];
  const edges = [
    { id: 'dx-in-out', source: inp, target: out, sourceHandle: 'output', targetHandle: 'main-input' },   // dry
    { id: 'dx-in-dly', source: inp, target: dly, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'dx-dly-wet', source: dly, target: wet, sourceHandle: 'output', targetHandle: 'main-input' },
    { id: 'dx-wet-out', source: wet, target: out, sourceHandle: 'output', targetHandle: 'main-input' },   // wet
  ];
  return { nodes, edges };
}

export interface FxDef { id: string; name: string; make: () => Flow; }

export const FX_LIBRARY: FxDef[] = [
  { id: 'lowpass', name: 'Lowpass', make: () => makeFilterFx({ type: 'lowpass', frequency: 1200 }) },
  { id: 'highpass', name: 'Highpass', make: () => makeFilterFx({ type: 'highpass', frequency: 400 }) },
  { id: 'delay', name: 'Delay', make: () => makeDelayFx({ delayTime: 250 }) },
];
