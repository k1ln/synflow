import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFlowEventFreqShifterNode } from '../src/virtualNodes/VirtualFlowEventFreqShifterNode';

const makeNode = (shift = 0) => ({
  id: 'shifter-1',
  data: { shift },
});

describe('VirtualFlowEventFreqShifterNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('shift=0 passes frequency through unchanged', async () => {
    const node = makeNode(0);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(onCb).toHaveBeenCalled();
    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 440)).toBeLessThan(0.01);
  });

  it('shift=+12 raises frequency by one octave', async () => {
    const node = makeNode(12);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 880)).toBeLessThan(0.01);
  });

  it('shift=-12 lowers frequency by one octave', async () => {
    const node = makeNode(-12);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 880 });
    await new Promise(r => setTimeout(r, 20));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 440)).toBeLessThan(0.01);
  });

  it('uses value field when frequency is not provided', async () => {
    const node = makeNode(12);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 20));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 880)).toBeLessThan(0.01);
  });

  it('receiveNodeOff calls sendNodeOff handler', async () => {
    const node = makeNode(0);
    const offCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOff(offCb);

    bus.emit(node.id + '.trigger-input.receiveNodeOff', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(offCb).toHaveBeenCalled();
  });

  it('shift-input updates shift amount dynamically', async () => {
    const node = makeNode(0);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.shift-input.receiveNodeOn', { value: 12 });
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - 880)).toBeLessThan(0.01);
  });

  it('setShift clamps to [-96, 96]', () => {
    const node = makeNode(0);
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setShift(200);
    expect((shifter as any).shift).toBe(96);
    shifter.setShift(-200);
    expect((shifter as any).shift).toBe(-96);
  });

  it('params update changes shift', async () => {
    const node = makeNode(0);
    const onCb = vi.fn();
    const shifter = new VirtualFlowEventFreqShifterNode(bus, node as any);
    shifter.setSendNodeOn(onCb);

    bus.emit(node.id + '.params.updateParams', { data: { shift: 7 } });
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.trigger-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    const expected = 440 * Math.pow(2, 7 / 12);
    const result = onCb.mock.calls[0][0] as any;
    expect(Math.abs(result.frequency - expected)).toBeLessThan(0.01);
  });
});
