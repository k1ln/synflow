import type { Flow } from './instruments';

export interface SampleInstrumentOpts {
  /** Sample bytes as base64 (SampleFlowNode decodes it natively). */
  base64: string;
  /** Loop/segment bounds in seconds. */
  start?: number;
  end: number;
  loop?: boolean;
}

/**
 * A sample instrument: Command-In → SampleFlowNode (one segment with the chosen
 * loop region) → Master. The bytes are embedded (portable), so it plays in any
 * host with just an AudioContext. Triggered via engine.command('trigger').
 */
export function makeSampleInstrument(opts: SampleInstrumentOpts): Flow {
  const samp = 'samp.SampleFlowNode';
  const master = 'master.MasterOutFlowNode';

  const segment = {
    id: 'seg1',
    label: 'main',
    start: opts.start ?? 0,
    end: opts.end,
    loopEnabled: !!opts.loop,
    loopMode: 'hold' as const,
    holdEnabled: !!opts.loop, // looped samples respond to note-off (gate)
  };

  const nodes = [
    {
      id: samp, type: 'SampleFlowNode',
      // The DAW triggers the segment directly: receiveNodeOn(samp, 'seg1').
      data: { arrayBuffer: opts.base64, segments: [segment], isTrigger: true, triggerHandle: 'seg1' },
    },
    { id: master, type: 'MasterOutFlowNode', data: {} },
  ];
  const edges = [
    { id: 'e-samp-master', source: samp, target: master, sourceHandle: 'output', targetHandle: 'destination-input' },
  ];
  return { nodes, edges };
}
