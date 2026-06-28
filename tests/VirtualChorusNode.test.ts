import { describe, it, expect, beforeEach, vi } from 'vitest';

import EventBus from '../src/sys/EventBus';
import { VirtualChorusNode } from '../src/virtualNodes/VirtualChorusNode';

const mockParam = (v = 0) => ({ value: v, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const mockGain = () => ({ gain: mockParam(1), connect: vi.fn(), disconnect: vi.fn() });
const mockDelay = () => ({ delayTime: mockParam(0), connect: vi.fn(), disconnect: vi.fn() });
const mockOsc = () => ({ frequency: mockParam(0), type: 'sine', connect: vi.fn(), start: vi.fn(), stop: vi.fn() });

const mockAudioContext = () => ({
  createGain: vi.fn(() => mockGain()),
  createDelay: vi.fn(() => mockDelay()),
  createOscillator: vi.fn(() => mockOsc()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'chorus-1', data });

describe('VirtualChorusNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs and starts both LFOs', () => {
    const ctx = mockAudioContext();
    const n = new VirtualChorusNode(ctx, bus, makeNode() as any);
    expect((n as any).lfo1.start).toHaveBeenCalled();
    expect((n as any).lfo2.start).toHaveBeenCalled();
  });

  it('maps rate/depth/mix to the audio graph', () => {
    const n = new VirtualChorusNode(mockAudioContext(), bus, makeNode({ rate: 2, depth: 4, mix: 0.25 }) as any);
    expect((n as any).lfo1.frequency.value).toBeCloseTo(2);
    expect((n as any).lfo2.frequency.value).toBeCloseTo(2 * 1.13);
    expect((n as any).depth1.gain.value).toBeCloseTo(0.004); // 4 ms -> seconds
    expect((n as any).wetGain.gain.value).toBeCloseTo(0.25);
    expect((n as any).dryGain.gain.value).toBeCloseTo(0.75);
  });

  it('clamps params to valid ranges', () => {
    const n = new VirtualChorusNode(mockAudioContext(), bus, makeNode() as any);
    n.render({ rate: 999, depth: 999, mix: 5 });
    expect((n as any).rate).toBe(8);
    expect((n as any).depthMs).toBe(8);
    expect((n as any).mix).toBe(1);
  });

  it('handleUpdateParams updates wet/dry mix', () => {
    const n = new VirtualChorusNode(mockAudioContext(), bus, makeNode() as any);
    n.handleUpdateParams(makeNode() as any, { data: { mix: 1 } });
    expect((n as any).wetGain.gain.value).toBeCloseTo(1);
    expect((n as any).dryGain.gain.value).toBeCloseTo(0);
  });

  it('params.updateParams event updates rate', async () => {
    const n = new VirtualChorusNode(mockAudioContext(), bus, makeNode() as any);
    bus.emit('chorus-1.params.updateParams', { data: { rate: 3 } });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).rate).toBeCloseTo(3);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualChorusNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});
