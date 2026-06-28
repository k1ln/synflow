import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualLogNode } from '../src/virtualNodes/VirtualLogNode';

const makeNode = (overrides: any = {}) => ({
  id: 'log-1',
  data: { ...overrides },
});

describe('VirtualLogNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('records an ON event', async () => {
    const node = makeNode();
    const log = new VirtualLogNode(bus, node);
    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));
    const entries = log.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('on');
  });

  it('records an OFF event', async () => {
    const node = makeNode();
    const log = new VirtualLogNode(bus, node);
    bus.emit(node.id + '.main-input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));
    expect(log.getEntries()[0].type).toBe('off');
  });

  it('prepends entries (most recent first)', async () => {
    const node = makeNode();
    const log = new VirtualLogNode(bus, node);
    bus.emit(node.id + '.main-input.receiveNodeOn', { seq: 1 });
    bus.emit(node.id + '.main-input.receiveNodeOn', { seq: 2 });
    await new Promise(r => setTimeout(r, 20));
    const entries = log.getEntries();
    expect(entries[0].payload.seq).toBe(2);
    expect(entries[1].payload.seq).toBe(1);
  });

  it('caps log at maxEntries (default 20)', async () => {
    const node = makeNode();
    const log = new VirtualLogNode(bus, node);
    for (let i = 0; i < 25; i++) {
      bus.emit(node.id + '.main-input.receiveNodeOn', { i });
    }
    await new Promise(r => setTimeout(r, 50));
    expect(log.getEntries().length).toBeLessThanOrEqual(20);
  });

  it('respects custom maxEntries', async () => {
    const node = makeNode({ maxEntries: 3 });
    const log = new VirtualLogNode(bus, node);
    for (let i = 0; i < 5; i++) {
      bus.emit(node.id + '.main-input.receiveNodeOn', { i });
    }
    await new Promise(r => setTimeout(r, 50));
    expect(log.getEntries().length).toBeLessThanOrEqual(3);
  });

  it('getEntries returns a copy (mutation does not affect log)', async () => {
    const node = makeNode();
    const log = new VirtualLogNode(bus, node);
    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    const a = log.getEntries();
    a.splice(0, a.length);
    expect(log.getEntries().length).toBe(1);
  });
});
