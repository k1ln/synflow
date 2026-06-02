import { describe, it, expect } from 'vitest';
import { AudioGraphManager, EventBus } from '@synflow/core';

// Minimal Web Audio param/node mocks so the engine's `instanceof AudioParam`
// checks resolve in node.
class FakeParam { value = 1; }
(globalThis as any).AudioParam = FakeParam;
(globalThis as any).AudioNode = class AudioNode {};

function mockCtx(): any {
  return {
    createGain: () => ({ gain: new FakeParam(), connect() {}, disconnect() {} }),
    destination: { connect() {}, disconnect() {} },
    currentTime: 0,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('host parameter API (automation from outside)', () => {
  it('getAudioParam + listParams resolve a node param', async () => {
    const nodes = [{ id: 'g.GainFlowNode', type: 'GainFlowNode', data: { gain: 0.5 } }];
    const mgr = new AudioGraphManager(mockCtx(), { current: nodes } as any, { current: [] } as any, { bus: new EventBus() });
    await mgr.initialize();

    expect(mgr.getAudioParam('g.GainFlowNode', 'gain')).toBeInstanceOf(FakeParam);
    expect(mgr.listParams('g.GainFlowNode').map((p) => p.name)).toContain('gain');
    expect(mgr.getAudioParam('g.GainFlowNode', 'nope')).toBeUndefined();
  });

  it('connectToParam wires a host signal to the AudioParam (audio-rate)', async () => {
    const nodes = [{ id: 'g.GainFlowNode', type: 'GainFlowNode', data: { gain: 1 } }];
    const mgr = new AudioGraphManager(mockCtx(), { current: nodes } as any, { current: [] } as any, { bus: new EventBus() });
    await mgr.initialize();

    let connectedTo: any = null;
    const lfo: any = { connect: (t: any) => { connectedTo = t; } };
    expect(mgr.connectToParam(lfo, 'g.GainFlowNode', 'gain')).toBe(true);
    expect(connectedTo).toBeInstanceOf(FakeParam);
    expect(mgr.connectToParam(lfo, 'g.GainFlowNode', 'missing')).toBe(false);
  });

  it('setParam updates the param (control-rate)', async () => {
    const nodes = [{ id: 'g.GainFlowNode', type: 'GainFlowNode', data: { gain: 1 } }];
    const mgr = new AudioGraphManager(mockCtx(), { current: nodes } as any, { current: [] } as any, { bus: new EventBus() });
    await mgr.initialize();
    const p = mgr.getAudioParam('g.GainFlowNode', 'gain')!;
    mgr.setParam('g.GainFlowNode', 'gain', 0.25);
    await tick();
    expect(p.value).toBe(0.25);
  });
});
