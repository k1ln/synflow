import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualAnalyzerNodeGPT from '../src/virtualNodes/VirtualAnalyzerNodeGPT';

// Suppress rAF loop in node environment
(globalThis as any).requestAnimationFrame = vi.fn(() => 1);
(globalThis as any).cancelAnimationFrame = vi.fn();
(globalThis as any).performance = { now: () => 0 };

const makeAnalyser = (fftSize = 1024) => ({
  fftSize,
  frequencyBinCount: fftSize / 2,
  minDecibels: -100,
  maxDecibels: -30,
  smoothingTimeConstant: 0,
  getByteFrequencyData: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const makeGainNode = () => ({
  gain: { value: 1 },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const mockAudioContext = () => {
  const analyser = makeAnalyser();
  const gain = makeGainNode();
  return {
    _analyser: analyser,
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => gain),
    currentTime: 0,
  } as any;
};

const makeNode = (data: any = {}) => ({ id: 'analyzer-1', data });

describe('VirtualAnalyzerNodeGPT', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs and sets tapGain as audioNode', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    expect(n.audioNode).toBeDefined();
    expect((n.audioNode as any).gain).toBeDefined();
  });

  it('render applies fftSize as power of 2', () => {
    const ctx = mockAudioContext();
    const node = makeNode({ fftSize: 512 });
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.render({ fftSize: 512 });
    expect(ctx._analyser.fftSize).toBe(512);
  });

  it('render clamps fftSize to nearest power of 2', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.render({ fftSize: 600 });
    expect(ctx._analyser.fftSize).toBe(1024);
  });

  it('render applies minDecibels', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.render({ minDecibels: -80 });
    expect(ctx._analyser.minDecibels).toBe(-80);
  });

  it('render applies maxDecibels', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.render({ maxDecibels: -10 });
    expect(ctx._analyser.maxDecibels).toBe(-10);
  });

  it('render clamps smoothingTimeConstant to [0, 0.99]', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.render({ smoothingTimeConstant: 1.5 });
    expect(ctx._analyser.smoothingTimeConstant).toBe(0.99);
    n.render({ smoothingTimeConstant: -1 });
    expect(ctx._analyser.smoothingTimeConstant).toBe(0);
  });

  it('disconnect cancels rAF', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualAnalyzerNodeGPT(ctx, bus, node as any);
    n.disconnect();
    expect((globalThis as any).cancelAnimationFrame).toHaveBeenCalled();
  });
});
