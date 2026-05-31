import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSequencerNode as VirtualSampleNode } from '../src/virtualNodes/VirtualSequencerNode';

const makeNode = (overrides: any = {}) => ({
  id: 'vsample1',
  type: 'VirtualSampleNode',
  data: {
    squares: 4,
    activeIndex: 0,
    pattern: [true, true, true, true],
    ...overrides,
  },
});

describe('VirtualSampleNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    // Use a fresh isolated bus per test
    bus = new (EventBus as any)();
  });

  it('emits on then off pulse for an active step', async () => {
    const node = makeNode();
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    const events: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));
    bus.subscribe(node.id + '.main-input.sendNodeOff', () => events.push('off'));
    v.advance();
    await new Promise(r => setTimeout(r, 50));
    expect(events[0]).toBe('on');
    expect(events[1]).toBe('off');
  });

  it('skips inactive steps (no pulse emitted)', async () => {
    const node = makeNode({ pattern: [false, false, false, false] });
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    const events: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));
    v.advance();
    await new Promise(r => setTimeout(r, 50));
    expect(events.length).toBe(0);
  });

  it('advance increments activeIndex', async () => {
    const node = makeNode();
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    v.advance();
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(1);
  });

  it('advance wraps activeIndex after last step', async () => {
    const node = makeNode({ squares: 2, pattern: [true, true] });
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    v.advance(); // → 1
    v.advance(); // → 0 (wrap)
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(0);
  });

  it('reset sets activeIndex to 0', async () => {
    const node = makeNode();
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    v.advance();
    v.advance();
    await new Promise(r => setTimeout(r, 10));
    v.reset();
    await new Promise(r => setTimeout(r, 10));
    expect(node.data.activeIndex).toBe(0);
  });

  it('advance via event bus works the same as direct advance()', async () => {
    const node = makeNode();
    new VirtualSampleNode(undefined as any, bus, node as any);
    const events: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 50));

    expect(events.length).toBeGreaterThan(0);
  });

  it('reset via event bus resets step to 0', async () => {
    const node = makeNode();
    const v = new VirtualSampleNode(undefined as any, bus, node as any);
    v.advance();
    v.advance();
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.reset.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 10));
    expect(node.data.activeIndex).toBe(0);
  });
});
