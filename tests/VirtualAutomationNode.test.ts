import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualAutomationNode } from '../src/virtualNodes/VirtualAutomationNode';

const makeNode = (overrides: any = {}) => ({
  id: 'auto-1',
  data: {
    lengthSec: 2,
    loop: true,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    minVal: 0,
    maxVal: 100,
    ...overrides,
  },
});

describe('VirtualAutomationNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('emits sendNodeOn with envelope data on trigger', async () => {
    const node = makeNode();
    new VirtualAutomationNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
    expect(events[0]).toHaveProperty('lengthSec');
    expect(events[0]).toHaveProperty('points');
  });

  it('emitted event includes points array', async () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }];
    const node = makeNode({ points: pts });
    new VirtualAutomationNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(events[0].points).toEqual(pts);
  });

  it('params update changes lengthSec', async () => {
    const node = makeNode();
    new VirtualAutomationNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.params.updateParams', { data: { lengthSec: 5 } });
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(events[0].lengthSec).toBe(5);
  });

  it('params update changes points', async () => {
    const node = makeNode();
    new VirtualAutomationNode(bus, node as any);
    const newPts = [{ x: 0, y: 1 }, { x: 1, y: 0 }];
    bus.emit(node.id + '.params.updateParams', { data: { points: newPts } });
    await new Promise(r => setTimeout(r, 10));

    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));
    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(events[0].points).toEqual(newPts);
  });

  it('does not emit on receiveNodeOff', async () => {
    const node = makeNode();
    new VirtualAutomationNode(bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOff', {});
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(0);
  });
});
