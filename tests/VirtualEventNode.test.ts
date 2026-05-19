import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualEventNode from '../src/virtualNodes/VirtualEventNode';

const makeNode = (overrides: any = {}) => ({
  id: 'ev-1',
  data: {
    id: 'ev-1',
    functionCode: 'return main;',
    listener: '',
    ...overrides,
  },
});

describe('VirtualEventNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('passes main-input value through identity function', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualEventNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(42);
  });

  it('transforms value using custom function', async () => {
    const cb = vi.fn();
    const node = makeNode({ functionCode: 'return Number(main) * 3;' });
    new VirtualEventNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 7 });
    await new Promise(r => setTimeout(r, 20));

    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(21);
  });

  it('emits sendNodeOn on the bus', async () => {
    const node = makeNode();
    new VirtualEventNode(bus, node as any, vi.fn());
    const out: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => out.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 'x' });
    await new Promise(r => setTimeout(r, 20));

    expect(out.some(e => e.value === 'x')).toBe(true);
  });

  it('emits sendNodeOff on receiveNodeOff', async () => {
    const node = makeNode();
    new VirtualEventNode(bus, node as any, vi.fn());
    const off: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOff', (d: any) => off.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(off.length).toBeGreaterThan(0);
  });

  it('listens to external event when listener is set', async () => {
    const cb = vi.fn();
    const node = makeNode({ listener: 'external.event' });
    new VirtualEventNode(bus, node as any, cb);

    bus.emit('external.event', { value: 55 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
  });

  it('params update changes listener and functionCode', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualEventNode(bus, node as any, cb);

    // External listener receives the full payload object as `main`
    bus.emit(node.id + '.params.updateParams', {
      data: { listener: 'new.event', functionCode: 'return (main && main.value !== undefined ? Number(main.value) : Number(main)) + 10;' },
    });
    await new Promise(r => setTimeout(r, 10));

    bus.emit('new.event', { value: 5 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(15);
  });

  it('handles function error gracefully', async () => {
    const cb = vi.fn();
    const node = makeNode({ functionCode: 'throw new Error("boom");' });
    new VirtualEventNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    // Should call cb with an error value rather than crashing
    expect(cb).toHaveBeenCalled();
    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toHaveProperty('error');
  });
});
