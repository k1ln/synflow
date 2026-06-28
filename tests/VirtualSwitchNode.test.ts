import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSwitchNode } from '../src/virtualNodes/VirtualSwitchNode';

const makeNode = (numOutputs = 3, activeOutput = 0) => ({
  id: 'switch-1',
  data: { numOutputs, activeOutput },
});

describe('VirtualSwitchNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('advances activeOutput on each trigger', async () => {
    const node = makeNode(3, 0);
    const sw = new VirtualSwitchNode(bus, node as any);
    const received: number[] = [];
    sw.setSendNodeOn((d: any) => received.push(d.activeOutput));

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(received[0]).toBe(1);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(received[1]).toBe(2);
  });

  it('wraps back to 0 after reaching last output', async () => {
    const node = makeNode(2, 0);
    const sw = new VirtualSwitchNode(bus, node as any);
    const received: number[] = [];
    sw.setSendNodeOn((d: any) => received.push(d.activeOutput));

    bus.emit(node.id + '.main-input.receiveNodeOn', {}); // → 1
    bus.emit(node.id + '.main-input.receiveNodeOn', {}); // → 0 (wrap)
    await new Promise(r => setTimeout(r, 30));
    expect(received[0]).toBe(1);
    expect(received[1]).toBe(0);
  });

  it('reset-input resets activeOutput to 0', async () => {
    const node = makeNode(4, 2);
    const sw = new VirtualSwitchNode(bus, node as any);

    bus.emit(node.id + '.reset-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect((node.data as any).activeOutput).toBe(0);
  });

  it('setNumOutputs clamps activeOutput if needed', () => {
    const node = makeNode(5, 4);
    const sw = new VirtualSwitchNode(bus, node as any);
    sw.setNumOutputs(2);
    // activeOutput 4 is out of bounds for 2 outputs — should be clamped
    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    // No crash expected; new active should be within [0, 1]
    expect((node.data as any).activeOutput).toBeLessThan(2);
  });

  it('setActiveOutput clamps to valid range', () => {
    const node = makeNode(3, 0);
    const sw = new VirtualSwitchNode(bus, node as any);
    sw.setActiveOutput(10);
    expect((node.data as any).activeOutput).toBe(2); // clamped to numOutputs-1
    sw.setActiveOutput(-5);
    expect((node.data as any).activeOutput).toBe(0);
  });

  it('dispose prevents further triggering', async () => {
    const node = makeNode(3, 0);
    const sw = new VirtualSwitchNode(bus, node as any);
    const received: number[] = [];
    sw.setSendNodeOn((d: any) => received.push(d.activeOutput));
    sw.dispose();

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(received.length).toBe(0);
  });

  it('emits sendNodeOn events via eventBus', async () => {
    const node = makeNode(2, 0);
    new VirtualSwitchNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('activeOutput');
  });
});
