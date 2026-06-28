import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualGranularNode } from '../src/virtualNodes/VirtualGranularNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'gr-1', data });

describe('VirtualGranularNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualGranularNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualGranularNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'position', 'pitch', 'size']);
  });

  it('caches initial params from node data', () => {
    const n = new VirtualGranularNode(mockAudioContext(), bus, makeNode({ density: 80, size: 200, position: 0.4, spray: 0.5, pitch: 2, mix: 0.6, freeze: true }) as any);
    expect((n as any).initial).toMatchObject({ density: 80, size: 200, position: 0.4, spray: 0.5, pitch: 2, mix: 0.6, freeze: true });
  });

  it('setFreeze + handleUpdateParams toggle the freeze flag', () => {
    const n = new VirtualGranularNode(mockAudioContext(), bus, makeNode() as any);
    n.setFreeze(true); expect((n as any).initial.freeze).toBe(true);
    const spy = vi.spyOn(n, 'setFreeze');
    n.handleUpdateParams(makeNode() as any, { data: { freeze: false } });
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('connectToInput buffers position/pitch/size mod inputs and wires main-input to the input gain', () => {
    const n = new VirtualGranularNode(mockAudioContext(), bus, makeNode() as any);
    const a = { connect: vi.fn() } as any; const b = { connect: vi.fn() } as any;
    n.connectToInput(a, 'position');
    expect((n as any).pendingParamInputs).toHaveLength(1);
    n.connectToInput(b, 'main-input');
    expect(b.connect).toHaveBeenCalledWith((n as any).inputGain);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualGranularNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise granular_process ───────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/granular.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.granular_new(SR);
  const pIn = w.alloc_f32(N), pL = w.alloc_f32(N), pR = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    freeze: (f: boolean) => w.granular_set_freeze(state, f ? 1 : 0),
    process: (input: Float32Array | null, { density = 100, size = 100, position = 0, spray = 0.3, pitch = 1, mix = 1 } = {}) => {
      const m = view();
      if (input) m.set(input, pIn >> 2);
      w.granular_process(state, pIn, input ? 1 : 0, pL, pR, N, density, size, position, spray, pitch, mix, SR);
      const mm = view();
      return [mm.slice(pL >> 2, (pL >> 2) + N), mm.slice(pR >> 2, (pR >> 2) + N)] as const;
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
const noise = () => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = (Math.random() * 2 - 1) * 0.5; return a; };

describe('granular.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/granular.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'granular_new', 'granular_set_freeze', 'granular_process']));
  });

  it('is silent with no input connected', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 10; b++) { const [l, r] = dsp.process(null); expect(energy(l) + energy(r)).toBe(0); }
  });

  it('sprays a wet cloud from the input (finite, audible)', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 120; b++) dsp.process(noise());
    let e = 0;
    for (let b = 0; b < 40; b++) { const [l, r] = dsp.process(noise()); expect(l.every((x) => Number.isFinite(x))).toBe(true); e += energy(l) + energy(r); }
    expect(e).toBeGreaterThan(0);
  });

  it('mix=0 passes the dry signal through', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 30; b++) dsp.process(noise());
    const inp = noise();
    const [l] = dsp.process(inp, { mix: 0 });
    for (let i = 0; i < N; i++) expect(l[i]).toBeCloseTo(inp[i], 5);
  });

  it('freeze keeps the cloud sounding after the input goes silent', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 120; b++) dsp.process(noise());
    dsp.freeze(true);
    let e = 0;
    const silence = new Float32Array(N);
    for (let b = 0; b < 40; b++) { const [l, r] = dsp.process(silence, { position: 0.3 }); e += energy(l) + energy(r); }
    expect(e).toBeGreaterThan(0);
  });

  it('stays finite at extreme density/spray/size', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 60; b++) {
      const [l, r] = dsp.process(noise(), { density: 200, spray: 1, size: 500, pitch: 3 });
      expect(l.every((x) => Number.isFinite(x))).toBe(true);
      expect(r.every((x) => Number.isFinite(x))).toBe(true);
    }
  });
});
