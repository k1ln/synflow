import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualBrassNode } from '../src/virtualNodes/VirtualBrassNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'brass-1', data });

describe('VirtualBrassNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'frequency']);
  });

  it('caches initial continuous params from node data', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode({
      frequency: 440, tension: 0.9, slide: 0.2, attack: 0.5, release: 0.7, vibratoRate: 0.3, vibratoGain: 0.6,
    }) as any);
    expect((n as any).cfg).toMatchObject({
      frequency: 440, tension: 0.9, slide: 0.2, attack: 0.5, release: 0.7, vibratoRate: 0.3, vibratoGain: 0.6,
    });
  });

  it('defaults continuous params when absent from node data', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    expect((n as any).cfg).toMatchObject({ frequency: 220, tension: 0.5, slide: 0.5, attack: 0.05, release: 0.1, vibratoRate: 0.5, vibratoGain: 0 });
  });

  it('a note-on event posts noteOn to the worklet port', async () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    (n as any).worklet = { port: { postMessage: vi.fn() } };
    bus.emit('brass-1.main-input.receiveNodeOn', { velocity: 0.8 });
    await new Promise(r => setTimeout(r, 10)); // EventBus delivery is async
    expect((n as any).worklet.port.postMessage).toHaveBeenCalledWith({ noteOn: true, velocity: 0.8 });
  });

  it('a note-off event posts noteOff to the worklet port', async () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    (n as any).worklet = { port: { postMessage: vi.fn() } };
    bus.emit('brass-1.main-input.receiveNodeOff', {});
    await new Promise(r => setTimeout(r, 10));
    expect((n as any).worklet.port.postMessage).toHaveBeenCalledWith({ noteOff: true });
  });

  it('connectToInput buffers frequency-mod inputs until worklet ready', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'frequency');
    expect((n as any).pendingParamInputs).toHaveLength(1);
    expect(src.connect).not.toHaveBeenCalled();
  });

  it('connectToInput wires main-input to the input gain immediately', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'main-input');
    expect(src.connect).toHaveBeenCalledWith((n as any).inputGain);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualBrassNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise brass_process ─────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/brass.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.brass_new(SR);
  const pFreq = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    noteOn: (v = 1) => w.brass_note_on(state, v),
    noteOff: () => w.brass_note_off(state),
    process: (
      { freq = 220, tension = 0.5, slide = 0.5, attack = 0.05, release = 0.1, vibratoRate = 0, vibratoGain = 0 } = {}
    ) => {
      const m = view();
      m[pFreq >> 2] = freq;
      w.brass_process(state, pFreq, 1, tension, slide, attack, release, vibratoRate, vibratoGain, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
const finite = (a: Float32Array) => a.every((x) => Number.isFinite(x));

describe('brass.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/brass.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'brass_new', 'brass_note_on', 'brass_note_off', 'brass_process']));
  });

  it('is silent until a note-on gates the breath envelope', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 4; b++) expect(energy(dsp.process())).toBe(0);
  });

  it('a note-on produces a genuinely sustained tone (not just a transient)', () => {
    const dsp = loadWasm();
    dsp.noteOn(1);
    for (let b = 0; b < 20; b++) dsp.process(); // let the breath envelope ramp up
    const mid = energy(dsp.process());
    expect(mid).toBeGreaterThan(0);
    for (let b = 0; b < 100; b++) dsp.process();
    const late = energy(dsp.process());
    // Should still be sounding an order of magnitude above silence, not decayed away.
    expect(late).toBeGreaterThan(mid * 0.01);
  });

  it('note-off releases the tone back to silence', () => {
    const dsp = loadWasm();
    dsp.noteOn(1);
    for (let b = 0; b < 30; b++) dsp.process();
    expect(energy(dsp.process())).toBeGreaterThan(0);
    dsp.noteOff();
    let last = 1;
    for (let b = 0; b < 200; b++) last = energy(dsp.process());
    expect(last).toBeLessThan(1e-6);
  });

  it('stays finite across a loud note and extreme knobs', () => {
    const dsp = loadWasm();
    dsp.noteOn(8);
    for (let b = 0; b < 200; b++) {
      const out = dsp.process({ freq: 1900, tension: 1, slide: 1, attack: 1, release: 1, vibratoRate: 1, vibratoGain: 1 });
      expect(finite(out)).toBe(true);
    }
  });

  it('stays finite at the low end of the frequency range', () => {
    const dsp = loadWasm();
    dsp.noteOn(4);
    for (let b = 0; b < 200; b++) {
      const out = dsp.process({ freq: 20, tension: 0, slide: 0, attack: 0, release: 0 });
      expect(finite(out)).toBe(true);
    }
  });

  it('tension audibly changes the output level', () => {
    const low = loadWasm();
    low.noteOn(1);
    for (let b = 0; b < 30; b++) low.process({ tension: 0.1 });
    const lowE = energy(low.process({ tension: 0.1 }));

    const high = loadWasm();
    high.noteOn(1);
    for (let b = 0; b < 30; b++) high.process({ tension: 0.9 });
    const highE = energy(high.process({ tension: 0.9 }));

    expect(lowE).not.toBeCloseTo(highE, 3);
  });
});
