import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualBlockingSwitchNode } from '../src/virtualNodes/VirtualBlockingSwitchNode';

const makeNode = (numOutputs = 2) => ({
  id: 'bsw-1',
  data: { numOutputs },
});

describe('VirtualBlockingSwitchNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('assigns first signal to output 0', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
    expect(events[0].activeOutput).toBe(0);
  });

  it('assigns second concurrent signal to output 1', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    bus.emit(node.id + '.input.receiveNodeOn', { value: 880 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(2);
    expect(events[0].activeOutput).toBe(0);
    expect(events[1].activeOutput).toBe(1);
  });

  it('blocks third signal when all outputs are occupied', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    bus.emit(node.id + '.input.receiveNodeOn', { value: 880 });
    bus.emit(node.id + '.input.receiveNodeOn', { value: 660 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(2);
  });

  it('routes nodeOff to the same output as nodeOn', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const offEvents: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOff', (d: any) => offEvents.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.input.receiveNodeOff', { value: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(offEvents.length).toBe(1);
    expect(offEvents[0].activeOutput).toBe(0);
  });

  it('frees output after nodeOff so it can be reused', async () => {
    const node = makeNode(1);
    new VirtualBlockingSwitchNode(bus, node as any);
    const onEvents: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOn', (d: any) => onEvents.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.input.receiveNodeOff', { value: 440 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.input.receiveNodeOn', { value: 880 });
    await new Promise(r => setTimeout(r, 20));

    expect(onEvents.length).toBe(2);
    expect(onEvents[1].activeOutput).toBe(0);
  });

  it('reset-input sends nodeOff to all occupied outputs', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const offEvents: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOff', (d: any) => offEvents.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    bus.emit(node.id + '.input.receiveNodeOn', { value: 880 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.reset-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(offEvents.length).toBe(2);
  });

  it('getStatus reflects occupied outputs', async () => {
    const node = makeNode(3);
    const sw = new VirtualBlockingSwitchNode(bus, node as any);

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 20));

    const status = sw.getStatus();
    expect(status.occupiedOutputs).toContain(0);
    expect(status.numOutputs).toBe(3);
  });

  it('ignores duplicate nodeOn from same signal', async () => {
    const node = makeNode(2);
    new VirtualBlockingSwitchNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    bus.emit(node.id + '.input.receiveNodeOn', { value: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
  });
});
