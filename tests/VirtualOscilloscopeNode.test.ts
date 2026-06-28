import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualOscilloscopeNode from '../src/virtualNodes/VirtualOscilloscopeNode';

(globalThis as any).requestAnimationFrame = vi.fn(() => 0);
(globalThis as any).cancelAnimationFrame = vi.fn();
(globalThis as any).performance = { now: () => 0 };

const makeAnalyser = (fftSize = 2048) => ({
  fftSize,
  frequencyBinCount: fftSize / 2,
  minDecibels: -90,
  maxDecibels: -10,
  smoothingTimeConstant: 0,
  getByteFrequencyData: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const makeGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });

const mockAudioContext = () => {
  const analyser = makeAnalyser();
  const gain = makeGain();
  return {
    _analyser: analyser,
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => gain),
    currentTime: 0,
  } as any;
};

const makeNode = (data: any = {}) => ({ id: 'scope-1', data });

describe('VirtualOscilloscopeNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs and exposes tapGain as audioNode', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    expect(n.audioNode).toBeDefined();
    expect((n.audioNode as any).gain).toBeDefined();
  });

  it('render applies fftSize as power of 2 (min 512)', () => {
    const ctx = mockAudioContext();
    const node = makeNode({ fftSize: 1024 });
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    n.render({ fftSize: 1024 });
    expect(ctx._analyser.fftSize).toBe(1024);
  });

  it('render clamps fftSize below min to 512', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    n.render({ fftSize: 64 });
    expect(ctx._analyser.fftSize).toBe(512);
  });

  it('render applies smoothingTimeConstant', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    n.render({ smoothingTimeConstant: 0.5 });
    expect(ctx._analyser.smoothingTimeConstant).toBe(0.5);
  });

  it('render clamps smoothingTimeConstant to 0.99', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    n.render({ smoothingTimeConstant: 2 });
    expect(ctx._analyser.smoothingTimeConstant).toBe(0.99);
  });

  it('render defaults smoothingTimeConstant to 0 when not provided', () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    const n = new VirtualOscilloscopeNode(ctx, bus, node as any);
    n.render({});
    expect(ctx._analyser.smoothingTimeConstant).toBe(0);
  });
});
