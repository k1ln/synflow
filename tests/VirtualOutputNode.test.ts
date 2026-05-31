import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualOutputNode } from '../src/virtualNodes/VirtualOutputNode';

const makeNode = (overrides: any = {}) => ({
  id: 'output-1',
  data: { value: null, index: 0, ...overrides },
});

describe('VirtualOutputNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('calls handleReceiveOutput on receiveNodeOn', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualOutputNode(bus, node as any, cb);

    bus.emit(node.id + '.input.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][2]).toBe('receiveNodeOn');
  });

  it('calls handleReceiveOutput on receiveNodeOff', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualOutputNode(bus, node as any, cb);

    bus.emit(node.id + '.input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][2]).toBe('receiveNodeOff');
  });

  it('getValue returns initial value', () => {
    const node = makeNode({ value: 'hello' });
    const n = new VirtualOutputNode(bus, node as any, vi.fn());
    expect(n.getValue()).toBe('hello');
  });

  it('setValue updates the stored value', () => {
    const node = makeNode({ value: 0 });
    const n = new VirtualOutputNode(bus, node as any, vi.fn());
    n.setValue(99);
    expect(n.getValue()).toBe(99);
  });

  it('updateParams event updates value and index', async () => {
    const node = makeNode({ value: 0, index: 0 });
    const n = new VirtualOutputNode(bus, node as any, vi.fn());

    bus.emit(node.id + '.params.updateParams', { data: { value: 7, index: 2 } });
    await new Promise(r => setTimeout(r, 20));

    expect(n.getValue()).toBe(7);
  });

  it('dispose unsubscribes all events', async () => {
    const cb = vi.fn();
    const node = makeNode();
    const n = new VirtualOutputNode(bus, node as any, cb);
    n.dispose();

    bus.emit(node.id + '.input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).not.toHaveBeenCalled();
  });
});
