import { describe, it, expect } from 'vitest';
import { Mixer } from '../src/audio/Mixer';
import lowpass from '../flows/effects/lowpass.json';

// Recording AudioParam + AudioNode base so the engine's instanceof checks resolve.
class FakeParam {
  value = 1;
  calls: Array<[string, number, number]> = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['ramp', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.value = v; return this; }
  cancelScheduledValues(_t: number) { return this; }
}
class MockAudioNode {
  connections: any[] = [];
  connect(t: any): any { this.connections.push(t); return t; }
  disconnect() { this.connections = []; }
}
(globalThis as any).AudioParam = FakeParam;
(globalThis as any).AudioNode = MockAudioNode;
(globalThis as any).AudioContext = class AudioContext {};
(globalThis as any).BaseAudioContext = class BaseAudioContext {};

const node = (props: Record<string, any>) => Object.assign(new MockAudioNode(), props);
let filtersCreated = 0;

function mockCtx(): any {
  return {
    createGain: () => node({ gain: new FakeParam() }),
    createBiquadFilter: () => { filtersCreated++; return node({ frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam(), detune: new FakeParam(), type: 'lowpass' }); },
    createOscillator: () => node({ frequency: new FakeParam(), detune: new FakeParam(), type: 'sine', start() {}, stop() {} }),
    createDelay: () => node({ delayTime: new FakeParam() }),
    destination: node({}),
    currentTime: 0,
    sampleRate: 48000,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('the effects are really rendered by @synflow/core', () => {
  it('a track FX insert is a @synflow/core engine: real BiquadFilter, audio I/O wired, host-controllable', async () => {
    filtersCreated = 0;
    const ctx = mockCtx();
    const mixer = new Mixer(ctx);
    const strip = mixer.strip('track-1', 0.8);

    // The DAW adds the Lowpass FLOW as an insert — exactly the production path.
    await strip.addFx('Lowpass', { nodes: lowpass.nodes, edges: lowpass.edges } as any);

    const insert = (strip as any).fx[0];
    const engine = insert.engine; // an AudioGraphManager

    // 1. The engine built a REAL Web Audio filter from the flow's BiquadFilter node.
    expect(filtersCreated).toBeGreaterThan(0);

    // 2. The FX exposes audio in/out (tagged isInput/isOutput) that the strip wires
    //    into the channel signal path.
    expect(insert.inId).toBe('in.GainFlowNode');
    expect(insert.outId).toBe('out.GainFlowNode');
    expect(engine.getAudioInput(insert.inId)).toBeInstanceOf(MockAudioNode);
    expect(engine.getAudioOutput(insert.outId)).toBeInstanceOf(MockAudioNode);

    // 3. The signal really flows in → filter → out inside the engine (edges become
    //    real .connect() calls on the rendered nodes).
    const filterParam = engine.getAudioParam('filt.BiquadFilterFlowNode', 'frequency') as unknown as FakeParam;
    expect(filterParam).toBeInstanceOf(FakeParam);

    // 4. The DAW drives the rendered filter live (setFxParam → engine.setParam).
    strip.setFxParam(0, 'filt.BiquadFilterFlowNode', 'frequency', 800);
    await tick();
    expect(filterParam.value).toBe(800);
  });
});
