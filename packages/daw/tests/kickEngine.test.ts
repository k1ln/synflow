import { describe, it, expect } from 'vitest';
import { InstrumentHost } from '../src/audio/InstrumentHost';
import kick from '../flows/instruments/kick.json';

// A Web Audio AudioParam mock that RECORDS every scheduled change, so we can
// prove the engine actually drives the audio graph. It must BE globalThis.AudioParam
// because @synflow/core uses `instanceof AudioParam` to find automatable params.
class FakeParam {
  value = 1;
  calls: Array<[string, number, number]> = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['ramp', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.value = v; this.calls.push(['target', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['exp', v, t]); return this; }
  cancelScheduledValues(_t: number) { return this; }
  cancelAndHoldAtTime(_t: number) { return this; }
}
// AudioNode/AudioParam base classes so the engine's `instanceof` checks resolve.
class MockAudioNode { connect(): any { return this; } disconnect() {} }
(globalThis as any).AudioParam = FakeParam;
(globalThis as any).AudioNode = MockAudioNode;
(globalThis as any).AudioContext = class AudioContext {};
(globalThis as any).BaseAudioContext = class BaseAudioContext {};

const node = (props: Record<string, any>) => Object.assign(new MockAudioNode(), props);
const osc = () => node({ frequency: new FakeParam(), detune: new FakeParam(), type: 'sine', start() {}, stop() {} });
const gain = () => node({ gain: new FakeParam() });

function mockCtx(): any {
  return {
    createOscillator: () => osc(),
    createGain: () => gain(),
    createBiquadFilter: () => node({ frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam(), detune: new FakeParam(), type: 'lowpass' }),
    createDelay: () => node({ delayTime: new FakeParam() }),
    destination: node({}),
    currentTime: 0,
    sampleRate: 48000,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10)); // EventBus dispatches async

describe('the kick flow is really played by @synflow/core', () => {
  it('has NO edge feeding the ADSR — it is triggered from outside via the EventBus', () => {
    // The only edges into the ADSR nodes... there are none. They are driven by
    // the host injecting receiveNodeOn, not by a graph connection.
    const adsrIds = kick.nodes.filter((n: any) => n.type === 'ADSRFlowNode').map((n: any) => n.id);
    const edgesIntoAdsr = kick.edges.filter((e: any) => adsrIds.includes(e.target));
    expect(adsrIds.length).toBeGreaterThan(0);
    expect(edgesIntoAdsr).toHaveLength(0);
  });

  it('InstrumentHost.trigger() → receiveNodeOn → the amp ADSR ramps the real gain AudioParam', async () => {
    const host = new InstrumentHost(mockCtx(), { nodes: kick.nodes, edges: kick.edges } as any);
    await host.load();
    expect(host.playable).toBe(true);

    const gainParam = host.engine.getAudioParam('gain.GainFlowNode', 'gain') as unknown as FakeParam;
    const freqParam = host.engine.getAudioParam('osc.OscillatorFlowNode', 'frequency') as unknown as FakeParam;
    expect(gainParam).toBeInstanceOf(FakeParam);
    expect(gainParam.calls).toHaveLength(0); // silent before the note

    host.trigger();   // the DAW injects the note — nothing in the graph feeds the ADSR
    await tick();     // let the EventBus dispatch

    // The amp envelope opened the gain (audible), and the pitch envelope swept the
    // oscillator frequency — both AudioParams were really scheduled by the engine.
    const gainRamps = gainParam.calls.filter((c) => c[0] === 'ramp');
    expect(gainRamps.length).toBeGreaterThan(0);
    expect(Math.max(...gainRamps.map((r) => r[1]))).toBeGreaterThan(0);
    expect(freqParam.calls.length).toBeGreaterThan(0);

    host.release();   // note off → release ramp back down
    await tick();
    expect(gainParam.calls.some((c) => c[0] === 'ramp')).toBe(true);
  });
});
