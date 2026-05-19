import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualSampleFlowNode from '../src/virtualNodes/VirtualAudioBufferSourceNode';

const makeBufferSource = () => ({
  buffer: null as any,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as any,
});

const makeGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });

const mockAudioContext = () => {
  const gain = makeGain();
  return {
    createGain: vi.fn(() => gain),
    createBufferSource: vi.fn(() => {
      const s = makeBufferSource();
      return s;
    }),
    decodeAudioData: vi.fn(async (buf: ArrayBuffer) => ({
      duration: 2.0,
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 88200,
    })),
    currentTime: 0,
  } as any;
};

const makeNode = (data: any = {}) => ({ id: 'sample-1', data });

const makeSegment = (id: string, start: number, end: number) => ({ id, start, end });

describe('VirtualSampleFlowNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    expect(() => new VirtualSampleFlowNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('render is a no-op and does not throw', () => {
    const ctx = mockAudioContext();
    const n = new VirtualSampleFlowNode(ctx, bus, makeNode() as any);
    expect(() => n.render()).not.toThrow();
  });

  it('decodes ArrayBuffer from node data on construction', async () => {
    const ctx = mockAudioContext();
    const buf = new ArrayBuffer(128);
    const node = makeNode({ arrayBuffer: buf });
    new VirtualSampleFlowNode(ctx, bus, node as any);
    await new Promise(r => setTimeout(r, 20));
    expect(ctx.decodeAudioData).toHaveBeenCalled();
  });

  it('plays segment when receiveNodeOn event fires after decode', async () => {
    const ctx = mockAudioContext();
    const buf = new ArrayBuffer(128);
    const seg = makeSegment('seg-a', 0, 1);
    const node = makeNode({ arrayBuffer: buf, segments: [seg] });
    new VirtualSampleFlowNode(ctx, bus, node as any);
    await new Promise(r => setTimeout(r, 30));
    bus.emit('sample-1.seg-a.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(ctx.createBufferSource).toHaveBeenCalled();
  });

  it('queues segment play requests if buffer not decoded yet', async () => {
    const ctx = mockAudioContext();
    // no arrayBuffer → decodedBuffer stays null initially
    const seg = makeSegment('seg-b', 0, 0.5);
    const node = makeNode({ segments: [seg] });
    const n = new VirtualSampleFlowNode(ctx, bus, node as any);
    bus.emit('sample-1.seg-b.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).pendingSegments.length).toBe(1);
  });

  it('updateParams with new segments re-subscribes', async () => {
    const ctx = mockAudioContext();
    const node = makeNode({});
    new VirtualSampleFlowNode(ctx, bus, node as any);
    const newSeg = makeSegment('seg-c', 0.5, 1.5);
    bus.emit('sample-1.params.updateParams', { data: { segments: [newSeg] } });
    await new Promise(r => setTimeout(r, 10));
    // should not throw and new segment should be subscribed
    expect(() => bus.emit('sample-1.seg-c.receiveNodeOn', {})).not.toThrow();
  });
});
