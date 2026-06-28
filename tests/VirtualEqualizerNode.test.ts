import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualEqualizerNode from '../src/virtualNodes/VirtualEqualizerNode';

(globalThis as any).requestAnimationFrame = vi.fn(() => 0);
(globalThis as any).cancelAnimationFrame = vi.fn();
(globalThis as any).performance = { now: () => 0 };

const makeParam = (v = 0) => ({ value: v });

const makeBiquad = () => ({
  type: 'peaking' as BiquadFilterType,
  frequency: makeParam(1000),
  gain: makeParam(0),
  Q: makeParam(1),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getFrequencyResponse: vi.fn((freqs: Float32Array, mag: Float32Array) => { mag.fill(1); }),
});

const makeAnalyser = () => ({
  fftSize: 2048,
  frequencyBinCount: 1024,
  smoothingTimeConstant: 0.8,
  minDecibels: -100,
  maxDecibels: -30,
  getByteFrequencyData: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const makeGain = (v = 1) => ({ gain: makeParam(v), connect: vi.fn(), disconnect: vi.fn() });

const mockAudioContext = () => ({
  createGain: vi.fn(makeGain),
  createBiquadFilter: vi.fn(makeBiquad),
  createAnalyser: vi.fn(makeAnalyser),
  currentTime: 0,
} as any);

const makeNode = (data: any = {}) => ({ id: 'eq-1', data });

describe('VirtualEqualizerNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs with 5 default bands', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    new VirtualEqualizerNode(ctx, bus, node as any);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(5);
  });

  it('getOutputNode returns the outputGain', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const eq = new VirtualEqualizerNode(ctx, bus, node as any);
    expect(eq.getOutputNode()).toBeDefined();
  });

  it('render applies custom bands', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const eq = new VirtualEqualizerNode(ctx, bus, node as any);
    const bands = [
      { id: 0, frequency: 100, gain: 3, Q: 1, type: 'lowshelf' as BiquadFilterType },
      { id: 1, frequency: 1000, gain: -3, Q: 2, type: 'peaking' as BiquadFilterType },
    ];
    eq.render({ bands });
    // After render with 2 bands, should have rebuilt the filter chain
    expect(ctx.createBiquadFilter.mock.calls.length).toBeGreaterThan(5);
  });

  it('handleSetBands event updates filters', async () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    new VirtualEqualizerNode(ctx, bus, node as any);
    const callsBefore = ctx.createBiquadFilter.mock.calls.length;
    bus.emit('eq-1.equalizer.setBands', {
      bands: [{ id: 0, frequency: 200, gain: 6, Q: 1, type: 'lowshelf' as BiquadFilterType }],
    });
    await new Promise(r => setTimeout(r, 10));
    // Band count changed from 5 to 1 → chain rebuild
    expect(ctx.createBiquadFilter.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('uses provided bands from node data', () => {
    const ctx = mockAudioContext();
    const bands = [
      { id: 0, frequency: 80, gain: 2, Q: 1, type: 'lowshelf' as BiquadFilterType },
      { id: 1, frequency: 500, gain: 0, Q: 1, type: 'peaking' as BiquadFilterType },
      { id: 2, frequency: 5000, gain: -2, Q: 1, type: 'highshelf' as BiquadFilterType },
    ];
    const node = makeNode({ bands });
    new VirtualEqualizerNode(ctx, bus, node as any);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(3);
  });
});
