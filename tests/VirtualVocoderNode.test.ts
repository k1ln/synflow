import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualVocoderNode } from '../src/virtualNodes/VirtualVocoderNode';

(globalThis as any).requestAnimationFrame = vi.fn(() => 0);
(globalThis as any).cancelAnimationFrame = vi.fn();
(globalThis as any).performance = { now: () => 0 };
(globalThis as any).setInterval = vi.fn(() => 42);
(globalThis as any).clearInterval = vi.fn();

const makeParam = (v = 0) => ({ value: v });
const makeBiquad = () => ({
  type: 'bandpass' as BiquadFilterType,
  frequency: makeParam(1000),
  Q: makeParam(1),
  gain: makeParam(0),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getByteTimeDomainData: vi.fn(),
});
const makeGain = (v = 1) => ({ gain: makeParam(v), connect: vi.fn(), disconnect: vi.fn() });
const makeAnalyser = () => ({
  fftSize: 512,
  frequencyBinCount: 256,
  smoothingTimeConstant: 0.7,
  minDecibels: -100,
  maxDecibels: -30,
  getByteFrequencyData: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const mockAudioContext = () => ({
  createGain: vi.fn(makeGain),
  createBiquadFilter: vi.fn(makeBiquad),
  createAnalyser: vi.fn(makeAnalyser),
  currentTime: 0,
  sampleRate: 44100,
} as any);

const makeNode = (data: any = {}) => ({
  id: 'vocoder-1',
  data: {
    bandCount: 4,
    lowFreq: 100,
    highFreq: 4000,
    attackTime: 5,
    releaseTime: 20,
    qFactor: 8,
    ...data,
  },
});

describe('VirtualVocoderNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    expect(() => new VirtualVocoderNode(ctx, bus, node as any)).not.toThrow();
  });

  it('exposes carrier and modulator input handles', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualVocoderNode(ctx, bus, node as any);
    expect(n.connectHandleNames).toContain('carrier');
    expect(n.connectHandleNames).toContain('modulator');
  });

  it('getOutputNode returns the outputGain node', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualVocoderNode(ctx, bus, node as any);
    const out = n.getOutputNode();
    expect(out).toBeDefined();
    expect((out as any).gain).toBeDefined();
  });

  it('modulatorInputGain is a gain node', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualVocoderNode(ctx, bus, node as any);
    expect((n as any).modulatorInputGain).toBeDefined();
    expect((n as any).modulatorInputGain.gain).toBeDefined();
  });

  it('creates bandCount * 2 biquad filters (carrier + modulator per band)', () => {
    const ctx = mockAudioContext();
    const node = makeNode({ bandCount: 4 });
    new VirtualVocoderNode(ctx, bus, node as any);
    // 4 bands × 2 filters (carrier + modulator) = 8
    expect(ctx.createBiquadFilter.mock.calls.length).toBe(8);
  });

  it('params.updateParams event does not throw', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    new VirtualVocoderNode(ctx, bus, node as any);
    expect(() =>
      bus.emit('vocoder-1.params.updateParams', {
        data: { bandCount: 8, qFactor: 10 },
      }),
    ).not.toThrow();
  });
});
