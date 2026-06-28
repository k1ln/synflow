import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualIIRFilterNode } from '../src/virtualNodes/VirtualIIRFilterNode';

let iirNodeCount = 0;
const mockIIRNode = () => ({
  id: ++iirNodeCount,
  connect: () => {},
  disconnect: () => {},
  frequency: { defaultValue: 0 },
});

const mockAudioContext = () => ({
  createIIRFilter: (_ff: number[], _fb: number[]) => mockIIRNode(),
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'iir-1',
  data: {
    feedforward: [0.5, 0.5],
    feedback: [1.0, -0.5],
    ...overrides,
  },
});

describe('VirtualIIRFilterNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
    iirNodeCount = 0;
  });

  it('creates IIR filter with provided coefficients', () => {
    const node = makeNode();
    const ctx = mockAudioContext();
    const spy = vi.spyOn(ctx, 'createIIRFilter');
    new VirtualIIRFilterNode(ctx, bus, node as any, vi.fn());
    expect(spy).toHaveBeenCalledWith([0.5, 0.5], [1.0, -0.5]);
  });

  it('handleUpdateParams updates feedforward coefficients', () => {
    const node = makeNode();
    const resetCb = vi.fn();
    const iir = new VirtualIIRFilterNode(mockAudioContext(), bus, node as any, resetCb);
    const oldNode = iir.audioNode;

    iir.handleUpdateParams({ data: { feedforward: [0.25, 0.75] } });

    // Node should be recreated
    expect(iir.audioNode).not.toBe(oldNode);
    expect(resetCb).toHaveBeenCalledWith(node.id);
  });

  it('handleUpdateParams updates feedback coefficients', () => {
    const node = makeNode();
    const resetCb = vi.fn();
    const iir = new VirtualIIRFilterNode(mockAudioContext(), bus, node as any, resetCb);

    iir.handleUpdateParams({ data: { feedback: [1.0, -0.3] } });

    expect(resetCb).toHaveBeenCalled();
  });

  it('params event triggers handleUpdateParams', async () => {
    const node = makeNode();
    const resetCb = vi.fn();
    new VirtualIIRFilterNode(mockAudioContext(), bus, node as any, resetCb);

    bus.emit(node.id + '.params.updateParams', { data: { feedforward: [1, 0] } });
    await new Promise(r => setTimeout(r, 20));

    expect(resetCb).toHaveBeenCalled();
  });

  it('always recreates node when new arrays are provided (reference comparison)', () => {
    const node = makeNode();
    const resetCb = vi.fn();
    const iir = new VirtualIIRFilterNode(mockAudioContext(), bus, node as any, resetCb);
    const oldNode = iir.audioNode;

    // Even same values produce a new array → new node
    iir.handleUpdateParams({ data: { feedforward: [0.5, 0.5] } });

    expect(iir.audioNode).not.toBe(oldNode);
    expect(resetCb).toHaveBeenCalledWith(node.id);
  });
});
