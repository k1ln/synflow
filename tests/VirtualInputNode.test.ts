import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualInputNode } from '../src/virtualNodes/VirtualInputNode';

const makeNode = (index = 0, value: any = 42) => ({
  id: 'input-node-1',
  data: { index, value },
});

describe('VirtualInputNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('forwards receiveNodeOn from indexed input to handleConnectedEdges', async () => {
    const cb = vi.fn();
    const node = makeNode(0, 'hello');
    new VirtualInputNode(bus, node as any, cb);

    bus.emit(node.id + 'input-0.receiveNodeOn', { value: 'hello' });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][2]).toBe('receiveNodeOn');
  });

  it('forwards receiveNodeOff from indexed input', async () => {
    const cb = vi.fn();
    const node = makeNode(1, 0);
    new VirtualInputNode(bus, node as any, cb);

    bus.emit(node.id + 'input-1.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][2]).toBe('receiveNodeOff');
  });

  it('handles index > 0 correctly', async () => {
    const cb = vi.fn();
    const node = makeNode(3);
    new VirtualInputNode(bus, node as any, cb);

    bus.emit(node.id + 'input-3.receiveNodeOn', { value: 99 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
  });

  it('does not respond to wrong index events', async () => {
    const cb = vi.fn();
    const node = makeNode(0);
    new VirtualInputNode(bus, node as any, cb);

    bus.emit(node.id + 'input-5.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).not.toHaveBeenCalled();
  });
});
