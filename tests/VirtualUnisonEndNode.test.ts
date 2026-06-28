import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualUnisonEndNode } from '../src/virtualNodes/VirtualUnisonEndNode';

const makeGainNode = () => {
  const gain = { value: 1 };
  return { gain, connect: () => {}, disconnect: () => {} };
};

const mockAudioContext = () => ({
  createGain: makeGainNode,
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'unison-end-1',
  data: { ...overrides },
});

describe('VirtualUnisonEndNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('creates a GainNode with gain of 1', () => {
    const node = makeNode();
    const n = new VirtualUnisonEndNode(mockAudioContext(), bus, node as any);
    expect(n.audioNode!.gain.value).toBe(1);
  });

  it('works without an audioContext (headless)', () => {
    const node = makeNode();
    expect(() => new VirtualUnisonEndNode(undefined, bus, node as any)).not.toThrow();
  });

  it('dispose does not throw', () => {
    const node = makeNode();
    const n = new VirtualUnisonEndNode(mockAudioContext(), bus, node as any);
    expect(() => n.dispose()).not.toThrow();
  });

  it('dispose unsubscribes events so no more callbacks fire', async () => {
    let called = false;
    const node = makeNode();
    const n = new VirtualUnisonEndNode(mockAudioContext(), bus, node as any);
    bus.subscribe(node.id + '.params.updateParams', () => { called = true; });
    n.dispose();
    bus.emit(node.id + '.params.updateParams', { data: {} });
    await new Promise(r => setTimeout(r, 20));
    expect(called).toBe(false);
  });
});
