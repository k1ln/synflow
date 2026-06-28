import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualReverbNode } from '../src/virtualNodes/VirtualReverbNode';

// Minimal AudioContext mock supporting convolver + buffer creation
const mockAudioContext = () => {
  const ctx: any = {
    sampleRate: 44100,
    currentTime: 0,
    createConvolver: () => ({
      buffer: null,
      connect: () => {},
      disconnect: () => {},
    }),
    createBuffer: (ch: number, len: number, sr: number) => ({
      numberOfChannels: ch,
      length: len,
      sampleRate: sr,
      getChannelData: () => new Float32Array(len),
    }),
  };
  return ctx;
};

const makeNode = (overrides: any = {}) => ({
  id: 'reverb-1',
  data: { seconds: 2, decay: 2, reverse: false, ...overrides },
});

describe('VirtualReverbNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('handleUpdateParams clamps seconds to [0.1, 50]', () => {
    const node = makeNode();
    const r = new VirtualReverbNode(mockAudioContext(), bus, node as any);
    r.handleUpdateParams(node as any, { data: { seconds: 999 } });
    expect(node.data.seconds).toBe(50);

    r.handleUpdateParams(node as any, { data: { seconds: 0 } });
    expect(node.data.seconds).toBe(0.1);
  });

  it('handleUpdateParams clamps decay to [0.01, 100]', () => {
    const node = makeNode();
    const r = new VirtualReverbNode(mockAudioContext(), bus, node as any);
    r.handleUpdateParams(node as any, { data: { decay: 200 } });
    expect(node.data.decay).toBe(100);

    r.handleUpdateParams(node as any, { data: { decay: -1 } });
    expect(node.data.decay).toBe(0.01);
  });

  it('handleUpdateParams sets reverse flag', () => {
    const node = makeNode();
    const r = new VirtualReverbNode(mockAudioContext(), bus, node as any);
    r.handleUpdateParams(node as any, { data: { reverse: true } });
    expect(node.data.reverse).toBe(true);
  });

  it('handleUpdateParams updates formula string', () => {
    const node = makeNode();
    const r = new VirtualReverbNode(mockAudioContext(), bus, node as any);
    const formula = 'Math.random() * 2 - 1';
    r.handleUpdateParams(node as any, { data: { formula } });
    expect(node.data.formula).toBe(formula);
  });
});
