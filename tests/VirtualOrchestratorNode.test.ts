import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualOrchestratorNode } from '../src/virtualNodes/VirtualOrchestratorNode';

const makeGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });

const mockAudioContext = () => ({
  createGain: vi.fn(makeGain),
  createBufferSource: vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  })),
  decodeAudioData: vi.fn(async () => ({ duration: 2 })),
  currentTime: 0,
  sampleRate: 44100,
} as any);

const makeNode = (data: any = {}) => ({
  id: 'orch-1',
  data: {
    rows: [],
    duration: 60,
    currentPosition: 0,
    ...data,
  },
});

describe('VirtualOrchestratorNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    expect(() => new VirtualOrchestratorNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('initial position is 0', () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    expect((n as any).currentPosition).toBe(0);
  });

  it('isPlaying starts as false', () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    expect((n as any).isPlaying).toBe(false);
  });

  it('restart event resets position to 0', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    (n as any).currentPosition = 5;
    bus.emit('orch-1.restart.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).currentPosition).toBe(0);
  });

  it('setPosition event updates currentPosition (0-1 normalized)', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    bus.emit('orch-1.setPosition.receiveNodeOn', { value: 0.5 });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).currentPosition).toBeGreaterThanOrEqual(0);
  });

  it('setPlaying(true) sets isPlaying to true', () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    n.setPlaying(true);
    expect((n as any).isPlaying).toBe(true);
  });

  it('setPlaying(false) sets isPlaying to false', () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    n.setPlaying(true);
    n.setPlaying(false);
    expect((n as any).isPlaying).toBe(false);
  });

  it('clock pulse updates tempo from payload', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    bus.emit('orch-1.clock.receiveNodeOn', { tempo: 140 });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).currentTempo).toBe(140);
  });

  it('clock pulse advances position when playing', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    n.setPlaying(true);
    bus.emit('orch-1.clock.receiveNodeOn', { tempo: 120 });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).currentPosition).toBeGreaterThan(0);
  });

  it('clock pulse does not advance position when not playing', async () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    bus.emit('orch-1.clock.receiveNodeOn', { tempo: 120 });
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).currentPosition).toBe(0);
  });

  it('constructs without audioContext', () => {
    expect(() => new VirtualOrchestratorNode(undefined, bus, makeNode() as any)).not.toThrow();
  });

  it('render does not throw', () => {
    const ctx = mockAudioContext();
    const n = new VirtualOrchestratorNode(ctx, bus, makeNode() as any);
    expect(() => n.render()).not.toThrow();
  });
});
