import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub browser audio globals missing in Node test environment
class AudioNode { connect = vi.fn(); disconnect = vi.fn(); }
class AudioParam { value = 0; setValueAtTime = vi.fn(); }
vi.stubGlobal('AudioNode', AudioNode);
vi.stubGlobal('AudioParam', AudioParam);

import EventBus from '../src/sys/EventBus';
import { VirtualNode } from '../src/virtualNodes/VirtualNode';

const makeAudioParam = (initial = 0) => ({
  value: initial,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

const makeAudioNode = (extraParams: Record<string, any> = {}) => ({
  gain: makeAudioParam(1),
  connect: vi.fn(),
  disconnect: vi.fn(),
  ...extraParams,
});

const makeAudioContext = () => ({ currentTime: 0 } as any);

const makeNode = (data: any = {}) => ({ id: 'vn-1', data });

describe('VirtualNode (base)', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('stores node, eventBus, and audioNode', () => {
    const audioNode = makeAudioNode() as any;
    const node = makeNode({ gain: 1 });
    const vn = new VirtualNode(makeAudioContext(), audioNode, bus, node as any);
    expect(vn.node).toBe(node);
    expect(vn.audioNode).toBe(audioNode);
    expect(vn.edges).toEqual([]);
  });

  it('handleUpdateParams updates node.data and AudioParam via event', async () => {
    const audioNode = makeAudioNode() as any;
    const node = makeNode({ gain: 1 });
    new VirtualNode(makeAudioContext(), audioNode, bus, node as any);

    bus.emit('vn-1.params.updateParams', { data: { gain: 0.25 } });
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.gain).toBe(0.25);
  });

  it('connect delegates to audioNode.connect', () => {
    const audioNode = makeAudioNode() as any;
    const dest = new AudioNode() as any;
    const vn = new VirtualNode(makeAudioContext(), audioNode, bus, makeNode() as any);
    vn.connect(dest);
    expect(audioNode.connect).toHaveBeenCalledWith(dest);
  });

  it('disconnect delegates to audioNode.disconnect', () => {
    const audioNode = makeAudioNode() as any;
    const vn = new VirtualNode(makeAudioContext(), audioNode, bus, makeNode() as any);
    vn.disconnect();
    expect(audioNode.disconnect).toHaveBeenCalled();
  });

  it('works without audioContext (headless)', () => {
    const node = makeNode({ x: 1 });
    expect(() => new VirtualNode(undefined, undefined as any, bus, node as any)).not.toThrow();
  });

  it('subscribeParams re-subscribes correctly after manual call', async () => {
    const audioNode = makeAudioNode() as any;
    const node = makeNode({ gain: 1 });
    const vn = new VirtualNode(makeAudioContext(), audioNode, bus, node as any);
    vn.subscribeParams();

    bus.emit('vn-1.params.updateParams', { data: { gain: 0.5 } });
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.gain).toBe(0.5);
  });
});
