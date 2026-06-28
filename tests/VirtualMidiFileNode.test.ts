import { describe, it, expect, vi, beforeEach } from 'vitest';

// MidiFileFlowNode.tsx is a React component file; mock the exports we need
vi.mock('../src/nodes/MidiFileFlowNode', () => ({
  // Types only — no runtime values needed; the virtual node just uses them as interfaces
}));

import EventBus from '../src/sys/EventBus';
import { VirtualMidiFileNode } from '../src/virtualNodes/VirtualMidiFileNode';

// Minimal ParsedMidiFile with two notes starting at tick 0 and tick 480
const makeMidiFile = (overrides: any = {}) => ({
  name: 'test.mid',
  ticksPerBeat: 480,
  totalTicks: 1920, // 4 bars at 480 PPQ
  totalBars: 4,
  tempoChanges: [{ tick: 0, bpm: 120 }],
  tracks: [{
    name: 'Track 1',
    notes: [
      { note: 60, velocity: 100, startTick: 0,   durationTicks: 240, channel: 0 },
      { note: 64, velocity: 90,  startTick: 480,  durationTicks: 240, channel: 0 },
      { note: 67, velocity: 80,  startTick: 960,  durationTicks: 240, channel: 0 },
    ],
  }],
  ...overrides,
});

const makeNode = (overrides: any = {}) => ({
  id: 'midi-file-1',
  data: {
    currentBar: 0,
    currentTick: 0,
    isPlaying: false,
    loop: false,
    midiFile: makeMidiFile(),
    subdivision: 1,
    ticksPerClock: 480, // one beat per clock for predictable tests
    transpose: 0,
    singleVoiceMode: false,
    ...overrides,
  },
});

describe('VirtualMidiFileNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });
  });

  it('constructs without throwing when given a valid midiFile', () => {
    const cb = vi.fn();
    expect(() => new VirtualMidiFileNode(bus, makeNode() as any, cb)).not.toThrow();
  });

  it('does not emit notes before first clock tick', async () => {
    const cb = vi.fn();
    new VirtualMidiFileNode(bus, makeNode() as any, cb);
    await new Promise(r => setTimeout(r, 20));
    expect(cb).not.toHaveBeenCalled();
  });

  it('emits receiveNodeOn for a note after clock tick', async () => {
    const cb = vi.fn();
    new VirtualMidiFileNode(bus, makeNode() as any, cb);

    bus.emit('midi-file-1.clock.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 30));

    const noteCalls = cb.mock.calls.filter(c => c[2] === 'receiveNodeOn');
    expect(noteCalls.length).toBeGreaterThan(0);
  });

  it('schedules a note-off after the note-on', async () => {
    const cb = vi.fn();
    new VirtualMidiFileNode(bus, makeNode() as any, cb);

    bus.emit('midi-file-1.clock.receiveNodeOn', {});
    // Default duration at 120 BPM, 480 PPQ, 240 ticks ≈ 250ms; wait generously
    await new Promise(r => setTimeout(r, 320));

    const offCalls = cb.mock.calls.filter(c => c[2] === 'receiveNodeOff');
    expect(offCalls.length).toBeGreaterThan(0);
  });

  it('advances tick position with each clock', async () => {
    const node = makeNode() as any;
    new VirtualMidiFileNode(bus, node, vi.fn());

    bus.emit('midi-file-1.clock.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.currentTick).toBe(480); // ticksPerClock = 480
  });

  it('reset brings tick back to 0', async () => {
    const node = makeNode() as any;
    new VirtualMidiFileNode(bus, node, vi.fn());

    bus.emit('midi-file-1.clock.receiveNodeOn', {});
    bus.emit('midi-file-1.clock.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.currentTick).toBeGreaterThan(0);

    bus.emit('midi-file-1.reset.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.currentTick).toBe(0);
  });

  it('loops back to tick 0 when it reaches end with loop=true', async () => {
    const node = makeNode({ loop: true }) as any;
    new VirtualMidiFileNode(bus, node, vi.fn());

    // 4 ticks × 480 = 1920 which hits totalTicks → reset fires → tick=0
    for (let i = 0; i < 4; i++) {
      bus.emit('midi-file-1.clock.receiveNodeOn', {});
    }
    await new Promise(r => setTimeout(r, 50));

    expect(node.data.currentTick).toBe(0);
  });

  it('stops at end without looping when loop=false', async () => {
    const node = makeNode({ loop: false }) as any;
    new VirtualMidiFileNode(bus, node, vi.fn());

    for (let i = 0; i < 5; i++) {
      bus.emit('midi-file-1.clock.receiveNodeOn', {});
    }
    await new Promise(r => setTimeout(r, 50));

    // Should not have wrapped back to start
    expect(node.data.isPlaying).toBe(false);
  });

  it('main-input.receiveNodeOn also acts as clock', async () => {
    const node = makeNode() as any;
    new VirtualMidiFileNode(bus, node, vi.fn());

    bus.emit('midi-file-1.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.currentTick).toBe(480);
  });

  it('updateParams transpose changes the transpose value', async () => {
    const node = makeNode() as any;
    const n = new VirtualMidiFileNode(bus, node, vi.fn());

    bus.emit('midi-file-1.params.updateParams', { data: { transpose: 12 } });
    await new Promise(r => setTimeout(r, 20));

    expect((n as any).transpose).toBe(12);
  });

  it('updateParams loop updates the loop flag', async () => {
    const node = makeNode({ loop: false }) as any;
    const n = new VirtualMidiFileNode(bus, node, vi.fn());

    bus.emit('midi-file-1.params.updateParams', { data: { loop: true } });
    await new Promise(r => setTimeout(r, 20));

    expect((n as any).loop).toBe(true);
  });
});
