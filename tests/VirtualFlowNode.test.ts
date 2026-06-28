import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFlowNode } from '../src/virtualNodes/VirtualFlowNode';

const makeNode = (overrides: any = {}) => ({
  id: 'flow-1',
  data: {
    selectedNode: '',
    outputArr: [0, 1],
    inputArr: [],
    ...overrides,
  },
});

describe('VirtualFlowNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('output handle event calls handleConnectedEdgesFromOutput', async () => {
    const cb = vi.fn();
    const node = makeNode({ outputArr: [0] });
    new VirtualFlowNode(bus, node as any, cb);

    bus.emit(node.id + '.output-0.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [, index, , eventType] = cb.mock.calls[0];
    expect(index).toBe(0);
    expect(eventType).toBe('receiveNodeOn');
  });

  it('output receiveNodeOff calls handleConnectedEdgesFromOutput with receiveNodeOff', async () => {
    const cb = vi.fn();
    const node = makeNode({ outputArr: [0] });
    new VirtualFlowNode(bus, node as any, cb);

    bus.emit(node.id + '.output-0.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [,,,eventType] = cb.mock.calls[0];
    expect(eventType).toBe('receiveNodeOff');
  });

  it('multiple outputs get distinct indices', async () => {
    const cb = vi.fn();
    const node = makeNode({ outputArr: [0, 1] });
    new VirtualFlowNode(bus, node as any, cb);

    bus.emit(node.id + '.output-0.receiveNodeOn', { value: 1 });
    bus.emit(node.id + '.output-1.receiveNodeOn', { value: 2 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalledTimes(2);
    const indices = cb.mock.calls.map(([, i]) => i);
    expect(indices).toContain(0);
    expect(indices).toContain(1);
  });

  it('params update re-subscribes (no crash)', async () => {
    const cb = vi.fn();
    const node = makeNode({ outputArr: [0] });
    new VirtualFlowNode(bus, node as any, cb);

    bus.emit(node.id + '.flowNode.updateParams', { data: { selectedNode: 'new-node' } });
    await new Promise(r => setTimeout(r, 20));

    // Still works after re-subscribe
    bus.emit(node.id + '.output-0.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));
    expect(cb).toHaveBeenCalled();
  });
});
