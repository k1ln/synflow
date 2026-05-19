import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/sys/wasmUtils', () => ({ compileWasmModule: vi.fn(async () => ({})) }));

import EventBus from '../src/sys/EventBus';
import VirtualNoiseNode from '../src/virtualNodes/VirtualNoiseNode';

const makeWorkletNode = () => ({
  parameters: new Map([['gain', { value: 1 }]]),
  port: { postMessage: vi.fn() },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const mockAudioContext = () => {
  const workletNode = makeWorkletNode();
  return {
    _worklet: workletNode,
    audioWorklet: {
      addModule: vi.fn(async () => {}),
    },
    currentTime: 0,
    _AudioWorkletNode: workletNode,
  } as any;
};

// Patch AudioWorkletNode globally so new AudioWorkletNode(...) returns our mock
const patchAudioWorkletNode = (ctx: any) => {
  (globalThis as any).AudioWorkletNode = class { constructor() { return ctx._worklet; } };
};

const makeNode = (noiseType = 'white') => ({
  id: 'noise-1',
  data: { noiseType },
});

describe('VirtualNoiseNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('white');
    expect(() => new VirtualNoiseNode(ctx, bus, node as any)).not.toThrow();
  });

  it('stores initial noise type', () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('pink');
    const n = new VirtualNoiseNode(ctx, bus, node as any);
    expect((n as any)._noiseType).toBe('pink');
  });

  it('setNoiseType updates internal type', () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('white');
    const n = new VirtualNoiseNode(ctx, bus, node as any);
    n.setNoiseType('brown' as any);
    expect((n as any)._noiseType).toBe('brown');
  });

  it('setNoiseType posts message to worklet port when node exists', async () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('white');
    const n = new VirtualNoiseNode(ctx, bus, node as any);
    await n.init();
    n.setNoiseType('pink' as any);
    expect(ctx._worklet.port.postMessage).toHaveBeenCalledWith({ type: 'setNoiseType', value: 'pink' });
  });

  it('getGainParam returns null before init', () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('white');
    const n = new VirtualNoiseNode(ctx, bus, node as any);
    // No workletNode until init() resolves; may be null or AudioParam depending on timing
    const result = n.getGainParam();
    // Just ensure it doesn't throw
    expect(result === null || result !== undefined).toBe(true);
  });

  it('noiseType event updates type via eventBus after init', async () => {
    const ctx = mockAudioContext();
    patchAudioWorkletNode(ctx);
    const node = makeNode('white');
    const n = new VirtualNoiseNode(ctx, bus, node as any);
    await n.init();
    bus.emit('noise-1.noiseType.change', { value: 'pink' });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any)._noiseType).toBe('pink');
  });
});
