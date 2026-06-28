import { describe, it, expect } from 'vitest';
import { AudioGraphManager, EventBus } from '@synflow/core';
import { makeSampleInstrument } from '../src/synflow/sampleInstrument';

// The engine uses `instanceof AudioNode/AudioParam/AudioContext` when wiring edges;
// provide stand-ins so headless construction in node doesn't ReferenceError.
const G = globalThis as any;
if (!G.AudioNode) G.AudioNode = class AudioNode {};
if (!G.AudioParam) G.AudioParam = class AudioParam {};
if (!G.AudioContext) G.AudioContext = class AudioContext {};

function mockCtx(): any {
  return {
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    destination: { connect() {}, disconnect() {} },
    currentTime: 0,
    decodeAudioData: async () => ({ duration: 1, numberOfChannels: 1, length: 8, sampleRate: 48000, getChannelData: () => new Float32Array(8) }),
  };
}

describe('makeSampleInstrument', () => {
  it('builds a portable sample instrument the engine can construct + trigger', async () => {
    const flow = makeSampleInstrument({ base64: 'AAAAAA==', start: 0.1, end: 0.9, loop: true });
    // structure: trigger-tagged SampleFlowNode (driven by receiveNodeOn on its segment)
    const sampNode = flow.nodes.find((n) => n.type === 'SampleFlowNode')!;
    expect(sampNode.data.isTrigger).toBe(true);
    expect(sampNode.data.triggerHandle).toBe('seg1');
    const seg = sampNode.data.segments[0];
    expect(seg.loopEnabled).toBe(true);
    expect(seg.start).toBeCloseTo(0.1); expect(seg.end).toBeCloseTo(0.9);

    // headless construction + the DAW can inject receiveNodeOn into the segment
    const mgr = new AudioGraphManager(mockCtx(), { current: flow.nodes } as any, { current: flow.edges } as any, { bus: new EventBus() });
    await mgr.initialize();
    expect(mgr.virtualNodes.has('samp.SampleFlowNode')).toBe(true);
    expect(() => mgr.receiveNodeOn('samp.SampleFlowNode', 'seg1')).not.toThrow();
    expect(() => mgr.receiveNodeOff('samp.SampleFlowNode', 'seg1')).not.toThrow();
  });
});
