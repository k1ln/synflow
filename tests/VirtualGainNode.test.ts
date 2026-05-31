import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualGainNode } from '../src/virtualNodes/VirtualGainNode';

const mockGainNode = () => {
  const gain = { value: 1 };
  return { gain, connect: () => {}, disconnect: () => {} };
};

const mockAudioContext = () => ({
  createGain: mockGainNode,
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'gain-1',
  data: { gain: 1, ...overrides },
});

describe('VirtualGainNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('creates with default gain of 1', () => {
    const node = makeNode();
    const gn = new VirtualGainNode(mockAudioContext(), bus, node as any);
    expect(gn.audioNode!.gain.value).toBe(1);
  });

  it('render sets gain value', () => {
    const node = makeNode();
    const gn = new VirtualGainNode(mockAudioContext(), bus, node as any);
    gn.render(0.5);
    expect(gn.audioNode!.gain.value).toBe(0.5);
  });

  it('render with gain=0 silences the node', () => {
    const node = makeNode();
    const gn = new VirtualGainNode(mockAudioContext(), bus, node as any);
    gn.render(0);
    expect(gn.audioNode!.gain.value).toBe(0);
  });
});
