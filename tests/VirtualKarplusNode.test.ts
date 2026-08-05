import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualKarplusNode } from '../src/virtualNodes/VirtualKarplusNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'kp-1', data });

describe('VirtualKarplusNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'frequency']);
  });

  it('caches initial continuous params from node data', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode({ frequency: 440, decay: 0.9, tone: 0.2, attack: 0.5, scatter: 0.7, muffle: 0.1 }) as any);
    expect((n as any).initial).toMatchObject({ frequency: 440, decay: 0.9, tone: 0.2, attack: 0.5, scatter: 0.7, muffle: 0.1 });
  });

  it('defaults attack/scatter/muffle when absent from node data', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    expect((n as any).initial).toMatchObject({ attack: 0.15, scatter: 0.3, muffle: 0.2 });
  });

  it('a note-on event triggers a pluck', async () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    const spy = vi.spyOn(n, 'pluck');
    bus.emit('kp-1.main-input.receiveNodeOn', { velocity: 0.8 });
    await new Promise(r => setTimeout(r, 10)); // EventBus delivery is async
    expect(spy).toHaveBeenCalledWith(0.8);
  });

  it('pluck does not throw before the worklet is ready', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.pluck(1)).not.toThrow();
  });

  it('connectToInput buffers frequency-mod inputs until worklet ready', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'frequency');
    expect((n as any).pendingParamInputs).toHaveLength(1);
    expect(src.connect).not.toHaveBeenCalled();
  });

  it('connectToInput wires main-input (exciter) to the input gain immediately', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'main-input');
    expect(src.connect).toHaveBeenCalledWith((n as any).inputGain);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualKarplusNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise karplus_process ────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/karplus.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.karplus_new(SR);
  const pFreq = w.alloc_f32(N), pIn = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    pluck: (v = 1) => w.karplus_pluck(state, v),
    process: (input: Float32Array | null = null, { freq = 220, decay = 0.4, tone = 0.6, attack = 0, scatter = 0, muffle = 0 } = {}) => {
      const m = view();
      if (input) m.set(input, pIn >> 2);
      m[pFreq >> 2] = freq;
      w.karplus_process(state, pFreq, 1, decay, tone, attack, scatter, muffle, pIn, input ? 1 : 0, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);

describe('karplus.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/karplus.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'karplus_new', 'karplus_pluck', 'karplus_process']));
  });

  it('is silent until plucked', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 4; b++) expect(energy(dsp.process(null))).toBe(0);
  });

  it('a pluck produces sound that then rings and decays', () => {
    const dsp = loadWasm();
    dsp.pluck(1);
    dsp.process(); dsp.process(); // let the noise burst finish
    const early = energy(dsp.process());
    expect(early).toBeGreaterThan(0);
    let late = early;
    for (let b = 0; b < 40; b++) late = energy(dsp.process());
    expect(late).toBeLessThan(early);
  });

  it('stays finite across a loud pluck and long ring', () => {
    const dsp = loadWasm();
    dsp.pluck(4);
    for (let b = 0; b < 60; b++) {
      const out = dsp.process(null, { decay: 1, tone: 1 });
      expect(out.every((x) => Number.isFinite(x))).toBe(true);
    }
  });

  it('stays finite at max attack/scatter/muffle', () => {
    const dsp = loadWasm();
    dsp.pluck(4);
    for (let b = 0; b < 60; b++) {
      const out = dsp.process(null, { decay: 1, tone: 1, attack: 1, scatter: 1, muffle: 1 });
      expect(out.every((x) => Number.isFinite(x))).toBe(true);
    }
  });

  it('a higher attack softens the initial onset (lower peak right after the pluck)', () => {
    // High frequency -> short delay length, so the burst reaches the output
    // tap within this same block instead of needing a block to propagate.
    const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

    const hard = loadWasm();
    hard.pluck(1);
    const hardPeak = peak(hard.process(null, { freq: 4000, attack: 0 }));

    const soft = loadWasm();
    soft.pluck(1);
    const softPeak = peak(soft.process(null, { freq: 4000, attack: 1 }));

    expect(softPeak).toBeLessThan(hardPeak);
  });

  it('a higher muffle darkens the output (reduces sample-to-sample brightness)', () => {
    const brightness = (a: Float32Array) => {
      let s = 0;
      for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; s += d * d; }
      return s;
    };
    const bright = loadWasm();
    bright.pluck(1);
    bright.process(); bright.process();
    const brightOut = bright.process(null, { muffle: 0 });

    const dark = loadWasm();
    dark.pluck(1);
    dark.process(); dark.process();
    const darkOut = dark.process(null, { muffle: 1 });

    expect(brightness(darkOut)).toBeLessThan(brightness(brightOut));
  });

  it('an external exciter input drives the string (no pluck needed)', () => {
    const dsp = loadWasm();
    let outE = 0;
    for (let b = 0; b < 6; b++) {
      const inp = new Float32Array(N);
      for (let i = 0; i < N; i++) inp[i] = (Math.random() * 2 - 1) * 0.5;
      const out = dsp.process(inp);
      if (b >= 2) outE += energy(out);
    }
    expect(outE).toBeGreaterThan(0);
  });
});
