import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualArpeggiatorNode } from '../src/virtualNodes/VirtualArpeggiatorNode';

const makeNode = (overrides: any = {}) => ({
  id: 'arp-1',
  data: {
    noteCount: 4,
    mode: 'up',
    baseFrequency: 440,
    octaveSpread: 1,
    currentStep: 0,
    swing: 0,
    ...overrides,
  },
});

const clockPulse = (bus: EventBus, nodeId: string, bpm = 120) =>
  bus.emit(`${nodeId}.clock-input.receiveNodeOn`, {
    bpm,
    intervalMs: (60 / bpm) * 1000,
  });

describe('VirtualArpeggiatorNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('emits a frequency on each clock pulse', async () => {
    const node = makeNode();
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const outputs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      outputs.push(d.frequency)
    );

    clockPulse(bus, node.id);
    await new Promise(r => setTimeout(r, 600)); // wait for subdivided notes

    expect(outputs.length).toBeGreaterThan(0);
    outputs.forEach(f => expect(f).toBeGreaterThan(0));
  });

  it('up mode emits ascending frequencies', async () => {
    const node = makeNode({ mode: 'up', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600); // fast BPM so subdivisions are short
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(4);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });

  it('down mode emits descending frequencies', async () => {
    const node = makeNode({ mode: 'down', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(4);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeLessThan(freqs[i - 1]);
    }
  });

  it('freq-input updates base frequency', async () => {
    const node = makeNode({ noteCount: 1 }); // 1 note = just the base frequency
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    bus.emit(node.id + '.freq-input.receiveNodeOn', { frequency: 880 });
    await new Promise(r => setTimeout(r, 20));

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.some(f => Math.abs(f - 880) < 1)).toBe(true);
  });

  it('reset-input resets to step 0', async () => {
    const node = makeNode({ mode: 'up', noteCount: 4, currentStep: 3 });
    const arp = new VirtualArpeggiatorNode(undefined, bus, node as any);

    bus.emit(node.id + '.reset-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.currentStep).toBe(0);
  });

  it('params update changes mode', async () => {
    const node = makeNode({ mode: 'up', noteCount: 4 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { mode: 'down' } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.mode).toBe('down');
  });

  it('params update clamps noteCount to 1-24', async () => {
    const node = makeNode();
    new VirtualArpeggiatorNode(undefined, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { noteCount: 0 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.noteCount).toBeGreaterThanOrEqual(1);

    bus.emit(node.id + '.params.updateParams', { data: { noteCount: 100 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.noteCount).toBeLessThanOrEqual(24);
  });

  it('chord mode emits single base frequency per pulse', async () => {
    const node = makeNode({ mode: 'chord', noteCount: 4 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    // chord mode emits just the base freq (returns [baseFrequency])
    expect(freqs.length).toBeGreaterThan(0);
    expect(freqs.every(f => Math.abs(f - 440) < 1)).toBe(true);
  });

  it('chord-major-up emits 3 notes (root, major third, fifth)', async () => {
    const node = makeNode({ mode: 'chord-major-up', baseFrequency: 440 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(3);
    // Root should be 440 Hz
    expect(Math.abs(freqs[0] - 440)).toBeLessThan(0.1);
    // Major third = 4 semitones up
    expect(freqs[1]).toBeGreaterThan(freqs[0]);
    // Perfect fifth = 7 semitones up
    expect(freqs[2]).toBeGreaterThan(freqs[1]);
  });

  it('chord-major-down emits 3 notes descending', async () => {
    const node = makeNode({ mode: 'chord-major-down', baseFrequency: 440 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(3);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeLessThan(freqs[i - 1]);
    }
  });

  it('chord-minor-up emits root, minor third, fifth', async () => {
    const node = makeNode({ mode: 'chord-minor-up', baseFrequency: 440 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(3);
    expect(Math.abs(freqs[0] - 440)).toBeLessThan(0.1);
    // Minor third (3 semitones) is lower than major third (4 semitones)
    const majorThird = 440 * Math.pow(2, 4 / 12);
    expect(freqs[1]).toBeLessThan(majorThird);
    expect(freqs[2]).toBeGreaterThan(freqs[1]);
  });

  it('chord-minor-down emits 3 notes descending', async () => {
    const node = makeNode({ mode: 'chord-minor-down', baseFrequency: 440 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 400));

    expect(freqs.length).toBe(3);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeLessThan(freqs[i - 1]);
    }
  });

  it('up-down mode produces ping-pong sequence without repeating endpoints', async () => {
    // 4 notes: up-down sequence = [0,1,2,3,2,1] = 6 notes per clock
    const node = makeNode({ mode: 'up-down', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(6);
    // First half ascends
    expect(freqs[0]).toBeLessThan(freqs[3]);
    // Second half descends (without repeating top or bottom)
    expect(freqs[4]).toBeLessThan(freqs[3]);
    expect(freqs[5]).toBeLessThan(freqs[4]);
  });

  it('down-up mode produces descending then ascending sequence without endpoints', async () => {
    // 4 notes: down-up = [3,2,1,0,1,2] = 6 notes per clock
    const node = makeNode({ mode: 'down-up', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(6);
    expect(freqs[0]).toBeGreaterThan(freqs[3]);
    expect(freqs[4]).toBeGreaterThan(freqs[3]);
  });

  it('up-down-incl mode repeats top and bottom notes', async () => {
    // 4 notes: up-down-incl = [0,1,2,3,3,2,1,0] = 8 notes per clock
    const node = makeNode({ mode: 'up-down-incl', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(8);
    // Top note appears twice (index 3 and 4)
    expect(Math.abs(freqs[3] - freqs[4])).toBeLessThan(0.01);
  });

  it('down-up-incl mode repeats bottom and top notes', async () => {
    // 4 notes: down-up-incl = [3,2,1,0,0,1,2,3] = 8 notes per clock
    const node = makeNode({ mode: 'down-up-incl', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(8);
    // Bottom note appears twice (index 3 and 4)
    expect(Math.abs(freqs[3] - freqs[4])).toBeLessThan(0.01);
  });

  it('random mode emits valid frequencies', async () => {
    const node = makeNode({ mode: 'random', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(4);
    const maxFreq = 440 * Math.pow(2, 1); // 1 octave up
    freqs.forEach(f => {
      expect(f).toBeGreaterThanOrEqual(440);
      expect(f).toBeLessThanOrEqual(maxFreq + 1);
    });
  });

  it('random-walk mode emits valid frequencies staying within range', async () => {
    const node = makeNode({ mode: 'random-walk', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(4);
    const maxFreq = 440 * Math.pow(2, 1);
    freqs.forEach(f => {
      expect(f).toBeGreaterThanOrEqual(440 - 1);
      expect(f).toBeLessThanOrEqual(maxFreq + 1);
    });
  });

  it('converge mode plays outer notes inward', async () => {
    // 4 notes: converge = [0,3,1,2] = 4 notes
    const node = makeNode({ mode: 'converge', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(4);
    // First note should be lowest, second highest (converging inward)
    expect(freqs[0]).toBeLessThan(freqs[1]);
  });

  it('diverge mode plays inner notes outward', async () => {
    // 4 notes: diverge = [1,2,0,3] = 4 notes (inner → outer)
    const node = makeNode({ mode: 'diverge', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(4);
    // Last two notes should be the extremes (outermost)
    expect(freqs[2]).toBeLessThan(freqs[3]);
  });

  it('shuffle mode plays all notes once without repeats per cycle', async () => {
    const node = makeNode({ mode: 'shuffle', noteCount: 4, octaveSpread: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) =>
      freqs.push(d.frequency)
    );

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(4);
    // All 4 frequencies should be distinct (each note played once)
    const unique = new Set(freqs.map(f => Math.round(f)));
    expect(unique.size).toBe(4);
  });

  it('octaveSpread affects the frequency range', async () => {
    const node1 = makeNode({ mode: 'up', noteCount: 4, octaveSpread: 1 });
    const node2 = makeNode({ ...makeNode({ mode: 'up', noteCount: 4, octaveSpread: 2 }).data, id: 'arp-2' });
    node2.id = 'arp-2';
    new VirtualArpeggiatorNode(undefined, bus, node1 as any);
    new VirtualArpeggiatorNode(undefined, bus, node2 as any);
    const freqs1: number[] = [];
    const freqs2: number[] = [];
    bus.subscribe(node1.id + '.main-output.sendNodeOn', (d: any) => freqs1.push(d.frequency));
    bus.subscribe(node2.id + '.main-output.sendNodeOn', (d: any) => freqs2.push(d.frequency));

    clockPulse(bus, node1.id, 600);
    clockPulse(bus, node2.id, 600);
    await new Promise(r => setTimeout(r, 200));

    const range1 = freqs1[freqs1.length - 1] - freqs1[0];
    const range2 = freqs2[freqs2.length - 1] - freqs2[0];
    expect(range2).toBeGreaterThan(range1);
  });

  it('output payload includes bpm and step fields', async () => {
    const node = makeNode({ mode: 'up', noteCount: 2 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const outputs: any[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) => outputs.push(d));

    clockPulse(bus, node.id, 300);
    await new Promise(r => setTimeout(r, 400));

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0]).toHaveProperty('bpm', 300);
    expect(outputs[0]).toHaveProperty('step');
    expect(outputs[0]).toHaveProperty('nodeId', node.id);
  });

  it('params update changes octaveSpread and clamps to 0.25-4', async () => {
    const node = makeNode();
    new VirtualArpeggiatorNode(undefined, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { octaveSpread: 0 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.octaveSpread).toBeGreaterThanOrEqual(0.25);

    bus.emit(node.id + '.params.updateParams', { data: { octaveSpread: 10 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.octaveSpread).toBeLessThanOrEqual(4);
  });

  it('params update changes swing and clamps to 0-1', async () => {
    const node = makeNode();
    new VirtualArpeggiatorNode(undefined, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { swing: -1 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.swing).toBe(0);

    bus.emit(node.id + '.params.updateParams', { data: { swing: 2 } });
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.swing).toBe(1);
  });

  it('params update changes baseFrequency', async () => {
    const node = makeNode({ noteCount: 1 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) => freqs.push(d.frequency));

    bus.emit(node.id + '.params.updateParams', { data: { baseFrequency: 220 } });
    await new Promise(r => setTimeout(r, 20));

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.some(f => Math.abs(f - 220) < 1)).toBe(true);
  });

  it('noteCount=1 emits only the base frequency', async () => {
    const node = makeNode({ noteCount: 1, baseFrequency: 440 });
    new VirtualArpeggiatorNode(undefined, bus, node as any);
    const freqs: number[] = [];
    bus.subscribe(node.id + '.main-output.sendNodeOn', (d: any) => freqs.push(d.frequency));

    clockPulse(bus, node.id, 600);
    await new Promise(r => setTimeout(r, 200));

    expect(freqs.length).toBe(1);
    expect(Math.abs(freqs[0] - 440)).toBeLessThan(0.1);
  });
}, 15000);
