import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../packages/core/src/wasmUtils', () => ({ compileWasmModule: vi.fn(async () => ({})) }));
vi.mock('../src/nodes/OscillatorFlowNode', () => ({
  buildPulsePeriodicWave: vi.fn(() => ({})),
  buildWavetablePeriodicWave: vi.fn(() => ({})),
}));

import EventBus from '../src/sys/EventBus';
import { VirtualAudioWorkletOscillatorNode } from '../src/virtualNodes/VirtualAudioWorkletOscillatorNode';

const makeWorkletNode = () => ({
  parameters: new Map<string, AudioParam>(),
  port: { postMessage: vi.fn(), onmessage: null as any },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

(globalThis as any).AudioWorkletNode = function () {
  return makeWorkletNode();
};
(globalThis as any).URL = {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
};
(globalThis as any).Blob = class {
  constructor(public parts: any[], public opts?: any) {}
};

const makeAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
  createPeriodicWave: vi.fn(() => ({})),
  sampleRate: 44100,
  currentTime: 0,
} as any);

const makeNode = (data: any = {}) => ({
  id: 'wo-1',
  data: { frequency: 440, type: 'sine', detune: 0, gain: 1, ...data },
});

describe('VirtualAudioWorkletOscillatorNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = makeAudioContext();
    expect(() => new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('oscType defaults to sine from node data', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode() as any);
    expect(n.oscType).toBe('sine');
  });

  it('oscType reflects provided type', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode({ type: 'sawtooth' }) as any);
    expect(n.oscType).toBe('sawtooth');
  });

  it('connectHandleNames includes main-input and sync', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode() as any);
    expect(n.connectHandleNames).toContain('main-input');
    expect(n.connectHandleNames).toContain('sync');
  });

  it('render creates a worklet node', async () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode() as any);
    await n.render(440, 'sine' as OscillatorType);
    expect(n.audioWorkletNode).not.toBeNull();
  });

  it('render with square type sets oscType', async () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletOscillatorNode(ctx, bus, makeNode() as any);
    await n.render(880, 'square' as OscillatorType);
    expect(n.oscType).toBe('square');
  });
});
