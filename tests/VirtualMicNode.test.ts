import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualMicNode } from '../src/virtualNodes/VirtualMicNode';

// Minimal AudioWorkletNode mock (for passthrough node creation)
(globalThis as any).AudioWorkletNode = class {
  constructor() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      numberOfInputs: 1,
      numberOfOutputs: 1,
    };
  }
};
(globalThis as any).URL = {
  createObjectURL: vi.fn(() => 'blob:test'),
  revokeObjectURL: vi.fn(),
};
(globalThis as any).Blob = class {
  constructor(public parts: any[], public opts?: any) {}
};

const makeMediaStream = (live = true) => ({
  getAudioTracks: () => [{ readyState: live ? 'live' : 'ended', stop: vi.fn() }],
  getTracks: () => [{ stop: vi.fn() }],
});

const makeAudioContext = () => ({
  sampleRate: 44100,
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
  currentTime: 0,
} as any);

const makeNode = (data: any = {}) => ({ id: 'mic-1', data });

describe('VirtualMicNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
    // Mock getUserMedia via defineProperty to bypass read-only getter
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: vi.fn(async () => makeMediaStream()) } },
      writable: true,
      configurable: true,
    });
  });

  it('constructs without throwing', () => {
    const ctx = makeAudioContext();
    expect(() => new VirtualMicNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('audioNode starts as undefined', () => {
    const ctx = makeAudioContext();
    const n = new VirtualMicNode(ctx, bus, makeNode() as any);
    expect(n.audioNode).toBeUndefined();
  });

  it('setDevice skips if same deviceId already active', async () => {
    const ctx = makeAudioContext();
    const n = new VirtualMicNode(ctx, bus, makeNode() as any);
    (n as any).currentDeviceId = 'dev-1';
    (n as any).currentStream = makeMediaStream();
    const spy = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    await n.setDevice('dev-1');
    expect(spy).not.toHaveBeenCalled();
  });

  it('params.updateParams event calls setDevice', async () => {
    const ctx = makeAudioContext();
    const n = new VirtualMicNode(ctx, bus, makeNode() as any);
    const spy = vi.spyOn(n, 'setDevice');
    bus.emit('mic-1.params.updateParams', { data: { selectedDeviceId: 'dev-2' } });
    await new Promise(r => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledWith('dev-2');
  });

  it('disconnect stops media tracks', async () => {
    const ctx = makeAudioContext();
    const n = new VirtualMicNode(ctx, bus, makeNode() as any);
    const track = { stop: vi.fn(), readyState: 'live' };
    (n as any).currentStream = { getAudioTracks: () => [track], getTracks: () => [track] };
    n.disconnect();
    expect(track.stop).toHaveBeenCalled();
  });

  it('disconnect clears currentStream', () => {
    const ctx = makeAudioContext();
    const n = new VirtualMicNode(ctx, bus, makeNode() as any);
    (n as any).currentStream = makeMediaStream();
    n.disconnect();
    expect((n as any).currentStream).toBeNull();
  });
});
