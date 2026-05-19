import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFrequencyNode } from '../src/virtualNodes/VirtualFrequencyNode';

const makeNode = (overrides: any = {}) => ({
  id: 'freq-1',
  data: { frequency: 440, frequencyType: 'hz', knobValue: 0, ...overrides },
});

describe('VirtualFrequencyNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('calls handleConnectedEdges with current frequency on trigger', async () => {
    const edges = vi.fn();
    const node = makeNode();
    new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0, edges);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edges).toHaveBeenCalledWith(
      node,
      expect.objectContaining({ frequency: 440, value: 440, frequencyType: 'hz' }),
      'receiveNodeOn'
    );
  });

  it('updates frequency via setFrequency and emits new value', async () => {
    const edges = vi.fn();
    const node = makeNode();
    const freqNode = new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0, edges);
    freqNode.setFrequency(880);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    const lastCall = edges.mock.calls[edges.mock.calls.length - 1];
    expect(lastCall[1]).toMatchObject({ frequency: 880, value: 880 });
  });

  it('updates frequency via params event and immediately re-emits', async () => {
    const edges = vi.fn();
    const node = makeNode();
    new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0, edges);

    bus.emit(node.id + '.params.updateParams', { data: { frequency: 660 } });
    await new Promise(r => setTimeout(r, 20));
    const lastCall = edges.mock.calls[edges.mock.calls.length - 1];
    expect(lastCall[1]).toMatchObject({ frequency: 660 });
  });

  it('updates frequencyType via params event', async () => {
    const edges = vi.fn();
    const node = makeNode();
    new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0, edges);

    bus.emit(node.id + '.params.updateParams', { data: { frequencyType: 'midi' } });
    await new Promise(r => setTimeout(r, 20));
    const lastCall = edges.mock.calls[edges.mock.calls.length - 1];
    expect(lastCall[1]).toMatchObject({ frequencyType: 'midi' });
  });

  it('includes knobValue in emitted data', async () => {
    const edges = vi.fn();
    const node = makeNode({ knobValue: 0.75 });
    new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0.75, edges);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(edges.mock.calls[0][1]).toMatchObject({ knobValue: 0.75 });
  });

  it('getFrequency returns current frequency', () => {
    const node = makeNode();
    const freqNode = new VirtualFrequencyNode(bus, node as any, 440, 'hz', 0, vi.fn());
    expect(freqNode.getFrequency()).toBe(440);
    freqNode.setFrequency(220);
    expect(freqNode.getFrequency()).toBe(220);
  });
});
