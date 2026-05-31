import { describe, it, expect, beforeEach, vi } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFlowNode } from '../src/virtualNodes/VirtualCustomNode';

const makeNode = (overrides: any = {}) => ({
  id: 'flow-1',
  data: {
    selectedNode: undefined,
    inputArr: [],
    outputArr: [],
    ...overrides,
  },
});

describe('VirtualFlowNode (VirtualCustomNode)', () => {
  let bus: EventBus;
  let outputHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bus = new (EventBus as any)();
    outputHandler = vi.fn();
  });

  it('constructs without throwing', () => {
    const node = makeNode();
    expect(() => new VirtualFlowNode(bus, node as any, outputHandler)).not.toThrow();
  });

  it('forwards main-input.receiveNodeOn to all inputs', async () => {
    const node = makeNode({ inputArr: [0] });
    const received: any[] = [];
    bus.subscribe('flow-1.input-0.receiveNodeOn', (d) => received.push(d));
    new VirtualFlowNode(bus, node as any, outputHandler);
    bus.emit('flow-1.main-input.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 30));
    expect(received.length).toBe(1);
  });

  it('output events forward to outputHandler', async () => {
    const node = makeNode({ outputArr: ['out-0'] });
    new VirtualFlowNode(bus, node as any, outputHandler);
    bus.emit('flow-1.output-out-0.receiveNodeOn', { note: 'A4' });
    await new Promise(r => setTimeout(r, 10));
    expect(outputHandler).toHaveBeenCalledWith(
      expect.anything(),
      0,
      expect.anything(),
      'receiveNodeOn',
    );
  });

  it('dispose unsubscribes all events', () => {
    const node = makeNode();
    const fn = new VirtualFlowNode(bus, node as any, outputHandler);
    const spy = vi.spyOn(bus, 'unsubscribeAllByNodeId');
    fn.dispose();
    expect(spy).toHaveBeenCalledWith('flow-1');
  });

  it('handleUpdateParams re-subscribes events', async () => {
    const node = makeNode();
    new VirtualFlowNode(bus, node as any, outputHandler);
    const spy = vi.spyOn(bus, 'unsubscribeAllByNodeId');
    bus.emit('flow-1.customNode.updateParams', { data: { selectedNode: 'node-abc' } });
    await new Promise(r => setTimeout(r, 10));
    expect(spy).toHaveBeenCalled();
  });
});
