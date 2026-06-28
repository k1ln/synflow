import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFrequencyShifterNode } from '../src/virtualNodes/VirtualFrequencyShifterNode';

// Minimal AudioContext mock — audioWorklet failures are caught internally
const mockAudioContext = () => ({
  audioWorklet: {
    addModule: async () => { throw new Error('not supported in test'); },
  },
  createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
  currentTime: 0,
} as any);

const makeNode = (shift = 0) => ({
  id: 'freqshift-1',
  data: { shift },
});

describe('VirtualFrequencyShifterNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('shift=0 passes frequency through unchanged', async () => {
    const node = makeNode(0);
    const onCb = vi.fn();
    const shifter = new VirtualFrequencyShifterNode(mockAudioContext(), bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 30));

    expect(onCb).toHaveBeenCalled();
    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 440)).toBeLessThan(0.01);
  });

  it('shift=+12 raises frequency by one octave', async () => {
    const node = makeNode(12);
    const onCb = vi.fn();
    const shifter = new VirtualFrequencyShifterNode(mockAudioContext(), bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 30));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 880)).toBeLessThan(0.01);
  });

  it('receiveNodeOff calls sendNodeOff handler', async () => {
    const node = makeNode(0);
    const offCb = vi.fn();
    const shifter = new VirtualFrequencyShifterNode(mockAudioContext(), bus, node as any);
    shifter.setSendNodeOff(offCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOff', { frequency: 440 });
    await new Promise(r => setTimeout(r, 30));

    expect(offCb).toHaveBeenCalled();
  });

  it('shift-input updates shift amount', async () => {
    const node = makeNode(0);
    const onCb = vi.fn();
    const shifter = new VirtualFrequencyShifterNode(mockAudioContext(), bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.shift-input.receiveNodeOn', { value: 12 });
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 30));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 880)).toBeLessThan(0.01);
  });
});
