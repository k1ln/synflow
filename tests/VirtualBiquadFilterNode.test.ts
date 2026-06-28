import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualBiquadFilterNode } from '../src/virtualNodes/VirtualBiquadFilterNode';

const mockParam = (initial = 0) => ({ value: initial });
const mockBiquadNode = () => ({
  type: 'lowpass' as BiquadFilterType,
  frequency: mockParam(350),
  Q: mockParam(1),
  gain: mockParam(0),
  detune: mockParam(0),
  connect: () => {},
  disconnect: () => {},
});
const mockAudioContext = () => ({
  createBiquadFilter: mockBiquadNode,
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'biquad-1',
  data: { filterType: 'lowpass', frequency: 1000, Q: 1, gain: 0, detune: 0, ...overrides },
});

describe('VirtualBiquadFilterNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('render sets filter type', () => {
    const node = makeNode();
    const f = new VirtualBiquadFilterNode(mockAudioContext(), bus, node as any);
    f.render('highpass', 2000);
    expect(f.audioNode!.type).toBe('highpass');
  });

  it('render sets frequency', () => {
    const node = makeNode();
    const f = new VirtualBiquadFilterNode(mockAudioContext(), bus, node as any);
    f.render('lowpass', 3000);
    expect(f.audioNode!.frequency.value).toBe(3000);
  });

  it('render sets Q value', () => {
    const node = makeNode();
    const f = new VirtualBiquadFilterNode(mockAudioContext(), bus, node as any);
    f.render('lowpass', 1000, 5);
    expect(f.audioNode!.Q.value).toBe(5);
  });

  it('render sets gain value', () => {
    const node = makeNode();
    const f = new VirtualBiquadFilterNode(mockAudioContext(), bus, node as any);
    f.render('peaking', 1000, 1, 6);
    expect(f.audioNode!.gain.value).toBe(6);
  });

  it('render defaults to lowpass at 1000Hz', () => {
    const node = makeNode();
    const f = new VirtualBiquadFilterNode(mockAudioContext(), bus, node as any);
    f.render();
    expect(f.audioNode!.type).toBe('lowpass');
    expect(f.audioNode!.frequency.value).toBe(1000);
  });
});
