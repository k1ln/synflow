import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSpeedDividerNode } from '../src/virtualNodes/VirtualSpeedDividerNode';

const makeNode = (divider = 2, multiplier = 1) => ({
  id: 'div-1',
  data: { divider, multiplier },
});

describe('VirtualSpeedDividerNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('divider=1 forwards every event', async () => {
    const node = makeNode(1);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(2);
  });

  it('divider=3 only forwards every 3rd hit', async () => {
    const node = makeNode(3);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    for (let i = 0; i < 6; i++) {
      bus.emit(node.id + '.input.receiveNodeOn', {});
    }
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(2); // 2 forwarded events out of 6
  });

  it('does not forward before reaching divider count', async () => {
    const node = makeNode(4);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(0);
  });

  it('forwards OFF events immediately regardless of divider', async () => {
    const node = makeNode(3);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const offEvents: number[] = [];
    sw.setSendNodeOff(() => offEvents.push(1));

    bus.emit(node.id + '.input.receiveNodeOff', {});
    await new Promise(r => setTimeout(r, 20));
    expect(offEvents.length).toBe(1);
  });

  it('emits hitCount status on each incoming event', async () => {
    const node = makeNode(3);
    new VirtualSpeedDividerNode(bus, node as any);
    const counts: number[] = [];
    bus.subscribe(node.id + '.status.hitCount', (d: any) =>
      counts.push(d.count)
    );

    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(counts.length).toBeGreaterThan(0);
  });

  it('divider-input handle updates divider dynamically', async () => {
    const node = makeNode(1);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    // Change divider to 2 via input
    bus.emit(node.id + '.divider-input.receiveNodeOn', { value: 2 });
    await new Promise(r => setTimeout(r, 20));

    // Now only every 2nd hit should fire
    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {}); // this should fire
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(1);
  });

  it('multiplier=1 fires sendNodeOn once per divider threshold', async () => {
    const node = makeNode(2, 1);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {}); // triggers
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(1);
  });

  it('resets hit count after forwarding', async () => {
    const node = makeNode(2);
    const sw = new VirtualSpeedDividerNode(bus, node as any);
    const fired: number[] = [];
    sw.setSendNodeOn(() => fired.push(1));

    // First batch
    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {}); // fires
    await new Promise(r => setTimeout(r, 20));

    // Second batch
    bus.emit(node.id + '.input.receiveNodeOn', {});
    bus.emit(node.id + '.input.receiveNodeOn', {}); // fires again
    await new Promise(r => setTimeout(r, 20));
    expect(fired.length).toBe(2);
  });
});
