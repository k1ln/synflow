import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualADSRNode } from '../src/virtualNodes/VirtualADSRNode';

const makeNode = (overrides: any = {}) => ({
  id: 'adsr-1',
  data: {
    attackTime: 0.1,
    sustainTime: 0.5,
    sustainLevel: 0.7,
    releaseTime: 0.3,
    minPercent: 0,
    maxPercent: 100,
    ...overrides,
  },
});

describe('VirtualADSRNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('calls onCb (nodeOn) when receiveNodeOn fires', async () => {
    const onCb = vi.fn();
    const offCb = vi.fn();
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, offCb, onCb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    expect(onCb).toHaveBeenCalled();
    expect(offCb).not.toHaveBeenCalled();
  });

  it('calls offCb (nodeOff) when receiveNodeOff fires', async () => {
    const onCb = vi.fn();
    const offCb = vi.fn();
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, offCb, onCb);

    // First turn on
    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 10));
    // Then off
    bus.emit(node.id + '.main-input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(offCb).toHaveBeenCalled();
  });

  it('passes minPercent and maxPercent in the payload', async () => {
    const onCb = vi.fn();
    const node = makeNode({ minPercent: 10, maxPercent: 80 });
    new VirtualADSRNode(bus, node as any, vi.fn(), onCb);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    const [, data] = onCb.mock.calls[0];
    expect((data as any).minPercent).toBe(10);
    expect((data as any).maxPercent).toBe(80);
  });

  it('params update changes attack, sustain, release times', async () => {
    const onCb = vi.fn();
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, vi.fn(), onCb);

    bus.emit(node.id + '.params.updateParams', {
      data: { attackTime: 0.5, sustainTime: 1, sustainLevel: 0.5, releaseTime: 0.8 },
    });
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.attackTime).toBe(0.5);
    expect(node.data.sustainTime).toBe(1);
    expect(node.data.releaseTime).toBe(0.8);
  });

  it('attack-input handle updates attackTime', async () => {
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, vi.fn(), vi.fn());

    bus.emit(node.id + '.attack-input.receiveNodeOn', { value: 2.0 });
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).attackTime).toBe(2.0);
  });

  it('release-input handle updates releaseTime', async () => {
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, vi.fn(), vi.fn());

    bus.emit(node.id + '.release-input.receiveNodeOn', { value: 1.5 });
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).releaseTime).toBe(1.5);
  });

  it('second nodeOn while already on calls offCb first', async () => {
    const onCb = vi.fn();
    const offCb = vi.fn();
    const node = makeNode();
    new VirtualADSRNode(bus, node as any, offCb, onCb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    // offCb should fire before the second noteOn (retrigger)
    expect(offCb).toHaveBeenCalled();
    expect(onCb).toHaveBeenCalledTimes(2);
  });
});
