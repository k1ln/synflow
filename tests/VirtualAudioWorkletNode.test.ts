import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualAudioWorkletNode } from '../src/virtualNodes/VirtualAudioWorkletNode';

// Stub AudioWorkletNode globally
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
  sampleRate: 44100,
  currentTime: 0,
} as any);

const makeNode = (data: any = {}) => ({
  id: 'worklet-1',
  data: { code: '', processorName: 'test-processor', ...data },
});

describe('VirtualAudioWorkletNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = makeAudioContext();
    expect(() => new VirtualAudioWorkletNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('getLastError returns null initially', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(n.getLastError()).toBeNull();
  });

  it('render is a no-op and does not throw', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(() => n.render()).not.toThrow();
  });

  it('enableDebugLogging does not throw', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(() => n.enableDebugLogging(true)).not.toThrow();
  });

  it('enableTestTone does not throw', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(() => n.enableTestTone(true)).not.toThrow();
  });

  it('getParameterById returns undefined for unknown id', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(n.getParameterById('nonexistent')).toBeUndefined();
  });

  it('getParameterByName returns undefined for unknown name', () => {
    const ctx = makeAudioContext();
    const n = new VirtualAudioWorkletNode(ctx, bus, makeNode() as any);
    expect(n.getParameterByName('nonexistent')).toBeUndefined();
  });
});
