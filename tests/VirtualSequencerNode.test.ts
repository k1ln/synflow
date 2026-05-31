import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSequencerNode } from '../src/virtualNodes/VirtualSequencerNode';

const makeNode = (overrides: any = {}) => ({
  id: 'seq-1',
  data: {
    squares: 4,
    rows: 1,
    activeIndex: 0,
    patterns: [[true, true, true, true]],
    pulseLengths: [10, 10, 10, 10],
    defaultPulseMs: 10,
    ...overrides,
  },
});

describe('VirtualSequencerNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('advances activeIndex on advance event', async () => {
    const node = makeNode();
    const n = new VirtualSequencerNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(1);
  });

  it('wraps back to 0 after last step', async () => {
    const node = makeNode({ squares: 2, patterns: [[true, true]], pulseLengths: [10, 10] });
    const n = new VirtualSequencerNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(0);
  });

  it('resets to 0 on reset event', async () => {
    const node = makeNode();
    const n = new VirtualSequencerNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(2);

    bus.emit(node.id + '.reset.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(0);
  });

  it('fires sendNodeOn on active step with enabled pattern', async () => {
    const pulses: any[] = [];
    const node = makeNode();
    const n = new VirtualSequencerNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-0.sendNodeOn', (d) => pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses[0].index).toBe(1);
  });

  it('does not fire sendNodeOn for disabled steps', async () => {
    const pulses: any[] = [];
    const node = makeNode({
      patterns: [[false, false, false, false]],
    });
    const n = new VirtualSequencerNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-0.sendNodeOn', (d) => pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(pulses.length).toBe(0);
  });

  it('main-input.receiveNodeOn also advances the sequencer', async () => {
    const node = makeNode();
    const n = new VirtualSequencerNode(undefined, bus, node as any);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(1);
  });

  it('updateParams changes squares count', async () => {
    const node = makeNode({ squares: 4 });
    const n = new VirtualSequencerNode(undefined, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { squares: 8 } });
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.squares).toBe(8);
  });

  it('fires sendNodeOn on row-1 for multi-row sequencer', async () => {
    const row1pulses: any[] = [];
    const node = makeNode({
      rows: 2,
      patterns: [[true, true, true, true], [true, true, true, true]],
    });
    const n = new VirtualSequencerNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-1.sendNodeOn', (d) => row1pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(row1pulses.length).toBeGreaterThan(0);
    expect(row1pulses[0].row).toBe(1);
  });
});
