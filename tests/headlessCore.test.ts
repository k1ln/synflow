import { describe, it, expect } from 'vitest';
// Import ONLY from the package public entry — proves @synflow/core runs with no
// React, no @xyflow, and no GUI/storage in the import graph.
import { AudioGraphManager, EventBus } from '@synflow/core';

// Minimal Web Audio mock — a headless host (DAW/game) supplies the real context.
function mockCtx(): any {
  const node = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return {
    createGain: node,
    destination: { connect() {}, disconnect() {} },
    currentTime: 0,
  };
}

describe('@synflow/core headless', () => {
  it('builds an audio graph from a plain flow with an injected bus (no React)', async () => {
    const nodes = [{ id: 'g.GainFlowNode', type: 'GainFlowNode', data: { gain: 0.5 } }];
    const edges: any[] = [];
    const bus = new EventBus();

    const mgr = new AudioGraphManager(mockCtx(), { current: nodes } as any, { current: edges } as any, { bus });
    await mgr.initialize();

    expect(mgr.virtualNodes.has('g.GainFlowNode')).toBe(true);
  });

  it('exposes the command API for external control', () => {
    const mgr = new AudioGraphManager(mockCtx(), { current: [] } as any, { current: [] } as any, { bus: new EventBus() });
    for (const fn of ['command', 'commandOff', 'noteOn', 'noteOff', 'onCommand', 'listCommands', 'listCommandOutputs']) {
      expect(typeof (mgr as any)[fn]).toBe('function');
    }
    // command() just emits on the bus — must not throw with no matching node.
    expect(() => mgr.command('anything', { value: 1 })).not.toThrow();
  });

  it('two engines on separate buses do not cross-talk', async () => {
    const busA = new EventBus();
    const busB = new EventBus();
    let aHits = 0;
    busA.subscribe('command.ping', () => { aHits++; });
    new AudioGraphManager(mockCtx(), { current: [] } as any, { current: [] } as any, { bus: busB });
    busB.emit('command.ping', {});
    await new Promise((r) => setTimeout(r, 5));
    expect(aHits).toBe(0); // busB activity never reached busA
  });

  it('receiveNodeOn/Off + sendNodeOn inject the right bus events (host drives the flow)', async () => {
    const bus = new EventBus();
    const got: string[] = [];
    bus.subscribe('n1.main-input.receiveNodeOn', () => got.push('recvOn'));
    bus.subscribe('n1.seg1.receiveNodeOff', () => got.push('recvOff'));
    bus.subscribe('n1.main-input.sendNodeOn', () => got.push('sendOn'));
    const mgr = new AudioGraphManager(mockCtx(), { current: [] } as any, { current: [] } as any, { bus });
    mgr.receiveNodeOn('n1');
    mgr.receiveNodeOff('n1', 'seg1');
    mgr.sendNodeOn('n1');
    await new Promise((r) => setTimeout(r, 5));
    expect(got.sort()).toEqual(['recvOff', 'recvOn', 'sendOn']);
  });
});
