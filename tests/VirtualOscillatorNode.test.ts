import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/nodes/OscillatorFlowNode', () => ({
  buildPulsePeriodicWave: vi.fn(() => ({})),
  buildWavetablePeriodicWave: vi.fn(() => ({})),
}));

import EventBus from '../src/sys/EventBus';
import VirtualOscillatorNode from '../src/virtualNodes/VirtualOscillatorNode';

const makeOscillator = () => ({
  frequency: { value: 440, setTargetAtTime: vi.fn() },
  detune: { value: 0 },
  type: 'sine' as OscillatorType,
  playbackState: 'stopped' as any,
  start: vi.fn(function (this: any) { this.playbackState = 'started'; }),
  stop: vi.fn(function (this: any) { this.playbackState = 'stopped'; }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setPeriodicWave: vi.fn(),
});

const makeGainNode = () => ({
  gain: { value: 1, setTargetAtTime: vi.fn() },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

let oscFactory: () => ReturnType<typeof makeOscillator>;

const mockAudioContext = () => {
  const ctx: any = {
    currentTime: 0,
    createOscillator: vi.fn(() => oscFactory()),
    createGain: vi.fn(makeGainNode),
    createPeriodicWave: vi.fn(() => ({})),
  };
  return ctx;
};

const makeNode = (overrides: any = {}) => ({
  id: 'osc-1',
  data: {
    frequency: 440,
    type: 'sine',
    gain: 1,
    detune: 0,
    ...overrides,
  },
});

describe('VirtualOscillatorNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
    oscFactory = makeOscillator;
  });

  it('render() creates and starts an oscillator', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(440, 'sine');
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(n.audioNode!.playbackState).toBe('started');
  });

  it('render() sets frequency on the oscillator', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(880, 'sine');
    expect(n.audioNode!.frequency.value).toBe(880);
  });

  it('render() sets waveform type', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(440, 'square');
    expect(n.audioNode!.type).toBe('square');
  });

  it('getOutputNode() returns the gain node', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(440, 'sine');
    expect(n.getOutputNode()).toBeDefined();
    expect((n.getOutputNode() as any).gain).toBeDefined();
  });

  it('getParamNode() returns the oscillator node', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(440, 'sine');
    expect(n.getParamNode()).toBe(n.audioNode);
  });

  it('handleUpdateParams gain updates the gain node', async () => {
    const ctx = mockAudioContext();
    const node = makeNode({ gain: 1 });
    const n = new VirtualOscillatorNode(ctx, bus, node as any, vi.fn());
    n.render(440, 'sine');
    const gainNode = n.getOutputNode() as any;
    bus.emit(node.id + '.params.updateParams', { data: { gain: 0.5 } });
    await new Promise(r => setTimeout(r, 20));
    expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 0, 0.01);
  });

  it('re-render calls resetConnectionsOfNode', () => {
    const ctx = mockAudioContext();
    const node = makeNode();
    const resetCb = vi.fn();
    const n = new VirtualOscillatorNode(ctx, bus, node as any, resetCb);
    n.render(440, 'sine');
    expect(resetCb).toHaveBeenCalledWith(node.id);
  });
});
