import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSequencerFrequencyNode } from '../src/virtualNodes/VirtualSequencerFrequencyNode';

const makeNode = (overrides: any = {}) => ({
  id: 'seqf-1',
  data: {
    squares: 4,
    rows: 1,
    activeIndex: 0,
    patterns: [[true, true, true, true]],
    frequencies: [[220, 330, 440, 550]],
    notes: [['A3', 'E4', 'A4', 'C#5']],
    pulseLengths: [50, 50, 50, 50],
    defaultPulseMs: 50,
    ...overrides,
  },
});

describe('VirtualSequencerFrequencyNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('advances activeIndex on advance event', async () => {
    const node = makeNode();
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(1);
  });

  it('wraps back to 0 after last step', async () => {
    const node = makeNode({ squares: 2, patterns: [[true, true]], frequencies: [[220, 330]], pulseLengths: [50, 50] });
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(0);
  });

  it('resets to 0 on reset event', async () => {
    const node = makeNode();
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(2);

    bus.emit(node.id + '.reset.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeIndex).toBe(0);
  });

  it('fires sendNodeOn with correct frequency on advance', async () => {
    const pulses: any[] = [];
    const node = makeNode();
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-0.sendNodeOn', (d) => pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses[0].value).toBe(330); // step index 1 → freq[0][1]
  });

  it('does not fire sendNodeOn for disabled pattern steps', async () => {
    const pulses: any[] = [];
    const node = makeNode({ patterns: [[false, false, false, false]] });
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-0.sendNodeOn', (d) => pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(pulses.length).toBe(0);
  });

  it('main-input.receiveNodeOn advances the sequencer', async () => {
    const node = makeNode();
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeIndex).toBe(1);
  });

  it('sendNodeOff fires after pulse duration elapses', async () => {
    const offs: any[] = [];
    const node = makeNode({ pulseLengths: [30, 30, 30, 30], defaultPulseMs: 30 });
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-0.sendNodeOff', (d) => offs.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 100));

    expect(offs.length).toBeGreaterThan(0);
    expect(offs[0].gate).toBe(0);
  });

  it('multi-row: fires on correct row channel', async () => {
    const row1pulses: any[] = [];
    const node = makeNode({
      rows: 2,
      patterns: [[true, true, true, true], [true, true, true, true]],
      frequencies: [[220, 330, 440, 550], [110, 165, 220, 275]],
      notes: [['A3', 'E4', 'A4', 'C#5'], ['A2', 'E3', 'A3', 'C#4']],
    });
    new VirtualSequencerFrequencyNode(undefined, bus, node as any);
    bus.subscribe(node.id + '.row-1.sendNodeOn', (d) => row1pulses.push(d));

    bus.emit(node.id + '.advance.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(row1pulses.length).toBeGreaterThan(0);
    expect(row1pulses[0].row).toBe(1);
    expect(row1pulses[0].value).toBe(165); // freq[1][1]
  });
});
