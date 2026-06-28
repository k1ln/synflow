import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualConstantNode } from '../src/virtualNodes/VirtualConstantNode';

const makeNode = (overrides: any = {}) => ({
  id: 'const-1',
  data: { value: 'hello', ...overrides },
});

describe('VirtualConstantNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('calls handleConnectedEdges with receiveNodeOn when triggered', async () => {
    const edgesCb = vi.fn();
    const node = makeNode();
    new VirtualConstantNode(bus, node as any, 'hello', edgesCb);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edgesCb).toHaveBeenCalledWith(node, { value: 'hello' }, 'receiveNodeOn');
  });

  it('calls handleConnectedEdges with receiveNodeOff when off-triggered', async () => {
    const edgesCb = vi.fn();
    const node = makeNode();
    new VirtualConstantNode(bus, node as any, 'hello', edgesCb);

    bus.emit(node.id + '.main-input.receiveNodeOff', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edgesCb).toHaveBeenCalledWith(node, { value: 'hello' }, 'receiveNodeOff');
  });

  it('emits updated value after params update', async () => {
    const edgesCb = vi.fn();
    const node = makeNode({ value: 'initial' });
    new VirtualConstantNode(bus, node as any, 'initial', edgesCb);

    // Update value via params
    bus.emit(node.id + '.params.updateParams', { data: { value: 'updated' } });
    await new Promise(r => setTimeout(r, 20));

    // Trigger to emit the new value
    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edgesCb).toHaveBeenLastCalledWith(node, { value: 'updated' }, 'receiveNodeOn');
  });

  it('passes through numeric values', async () => {
    const edgesCb = vi.fn();
    const node = makeNode({ value: 42 });
    new VirtualConstantNode(bus, node as any, 42, edgesCb);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edgesCb.mock.calls[0][1]).toMatchObject({ value: 42 });
  });
});
