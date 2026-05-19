import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/util/FileSystemAudioStore', () => ({
  loadRootHandle: vi.fn(async () => ({})),
  writeAudioBlob: vi.fn(async () => {}),
}));

import EventBus from '../src/sys/EventBus';
import { VirtualRecordingNode } from '../src/virtualNodes/VirtualRecordingNode';

const makeGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });

const makeWorkletNode = () => ({
  port: {
    postMessage: vi.fn(),
    onmessage: null as any,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const mockAudioContext = () => {
  const gain = makeGain();
  const worklet = makeWorkletNode();
  return {
    _gain: gain,
    _worklet: worklet,
    createGain: vi.fn(() => gain),
    audioWorklet: { addModule: vi.fn(async () => {}) },
    sampleRate: 44100,
    currentTime: 0,
  } as any;
};

(globalThis as any).AudioWorkletNode = vi.fn(function (this: any) {
  return {
    port: { postMessage: vi.fn(), onmessage: null },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
});
(globalThis as any).URL = {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
};
(globalThis as any).Blob = class {
  constructor(public parts: any[], public opts: any) {}
};

const makeNode = (data: any = {}) => ({ id: 'rec-1', data });

describe('VirtualRecordingNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    expect(() => new VirtualRecordingNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('audioNode is the passthroughGain', () => {
    const ctx = mockAudioContext();
    const n = new VirtualRecordingNode(ctx, bus, makeNode() as any);
    expect(n.audioNode).toBeDefined();
    expect((n.audioNode as any).gain).toBeDefined();
  });

  it('start event sets recording to true', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualRecordingNode(ctx, bus, makeNode() as any);
    bus.emit('rec-1.control.start', {});
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).recording).toBe(true);
  });

  it('stop event sets recording to false', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualRecordingNode(ctx, bus, makeNode() as any);
    bus.emit('rec-1.control.start', {});
    await new Promise(r => setTimeout(r, 10));
    bus.emit('rec-1.control.stop', {});
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).recording).toBe(false);
  });

  it('respects maxBytes from node data', () => {
    const ctx = mockAudioContext();
    const n = new VirtualRecordingNode(ctx, bus, makeNode({ maxBytes: 1024 }) as any);
    expect((n as any).maxBytes).toBe(1024);
  });

  it('respects maxSeconds from node data', () => {
    const ctx = mockAudioContext();
    const n = new VirtualRecordingNode(ctx, bus, makeNode({ maxSeconds: 30 }) as any);
    expect((n as any).maxSeconds).toBe(30);
  });
});
