import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualSvfDriveFilterNode } from '../src/virtualNodes/VirtualSvfDriveFilterNode';

// In the node test env there is no AudioWorkletNode global, so initWorklet()
// throws and is caught internally — the virtual node still constructs and its
// pure control methods remain testable.
const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'svf-1', data });

describe('VirtualSvfDriveFilterNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'cutoff', 'resonance']);
  });

  it('setMode normalizes strings, indices and clamps', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    n.setMode('hp'); expect((n as any).initial.mode).toBe(1);
    n.setMode('notch'); expect((n as any).initial.mode).toBe(3);
    n.setMode(2); expect((n as any).initial.mode).toBe(2);
    n.setMode(99); expect((n as any).initial.mode).toBe(3);
    n.setMode('garbage'); expect((n as any).initial.mode).toBe(0);
  });

  it('setSlope maps 12/24 dB to one/two stages', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    n.setSlope(24); expect((n as any).initial.slope).toBe(2);
    n.setSlope(2); expect((n as any).initial.slope).toBe(2);
    n.setSlope(12); expect((n as any).initial.slope).toBe(1);
    n.setSlope(1); expect((n as any).initial.slope).toBe(1);
  });

  it('caches initial continuous params from node data', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode({ cutoff: 800, resonance: 0.7, drive: 5, mix: 0.5 }) as any);
    expect((n as any).initial).toMatchObject({ cutoff: 800, resonance: 0.7, drive: 5, mix: 0.5 });
  });

  it('handleUpdateParams routes mode/slope to setters', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    const mSpy = vi.spyOn(n, 'setMode');
    const sSpy = vi.spyOn(n, 'setSlope');
    n.handleUpdateParams(makeNode() as any, { data: { mode: 'bp', slope: 24 } });
    expect(mSpy).toHaveBeenCalledWith('bp');
    expect(sSpy).toHaveBeenCalledWith(24);
  });

  it('connectToInput buffers param-mod inputs until worklet ready', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'cutoff');
    expect((n as any).pendingParamInputs).toHaveLength(1);
    expect(src.connect).not.toHaveBeenCalled();
  });

  it('connectToInput wires main-input to the input gain immediately', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'main-input');
    expect(src.connect).toHaveBeenCalledWith((n as any).inputGain);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualSvfDriveFilterNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise svf_process ────────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/svf-drive.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.svf_new();
  const pIn = w.alloc_f32(N), pCut = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    setMode: (m: number) => w.svf_set_mode(state, m),
    setSlope: (s: number) => w.svf_set_slope(state, s),
    process: (input: Float32Array | null, { resonance = 0.2, drive = 1, mix = 1, cutoff = 1000 } = {}) => {
      const m = view();
      if (input) m.set(input, pIn >> 2);
      m[pCut >> 2] = cutoff;
      w.svf_process(state, pIn, input ? 1 : 0, pCut, 1, resonance, drive, mix, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
const zeros = () => new Float32Array(N);

describe('svf-drive.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/svf-drive.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'svf_new', 'svf_set_mode', 'svf_set_slope', 'svf_process']));
  });

  it('lowpass impulse response is finite and decays', () => {
    const dsp = loadWasm();
    const impulse = zeros(); impulse[0] = 1;
    const out0 = dsp.process(impulse);
    expect(out0.every((x) => Number.isFinite(x))).toBe(true);
    expect(energy(out0)).toBeGreaterThan(0);

    const prevE = energy(out0);
    let lastE = prevE;
    for (let b = 0; b < 8; b++) { const out = dsp.process(zeros()); expect(out.every((x) => Number.isFinite(x))).toBe(true); lastE = energy(out); }
    expect(lastE).toBeLessThan(prevE);
  });

  it('emits silence (no NaN) when no input is connected', () => {
    const dsp = loadWasm();
    const out = dsp.process(null);
    expect(out.every((x) => x === 0)).toBe(true);
  });

  it('stays finite at high drive + high resonance (self-osc region), 24 dB', () => {
    const dsp = loadWasm(); dsp.setSlope(2);
    for (let b = 0; b < 16; b++) {
      const inp = zeros();
      for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 220 * (b * N + i)) / SR);
      const out = dsp.process(inp, { drive: 20, resonance: 0.99, cutoff: 2000 });
      expect(out.every((x) => Number.isFinite(x))).toBe(true);
    }
  });

  it('mix=0 passes the dry signal through unchanged', () => {
    const dsp = loadWasm();
    const inp = zeros();
    for (let i = 0; i < N; i++) inp[i] = Math.sin(i);
    const out = dsp.process(inp, { mix: 0 });
    for (let i = 0; i < N; i++) expect(out[i]).toBeCloseTo(inp[i], 5);
  });

  it('highpass mode keeps highs and cuts a low tone', () => {
    const dsp = loadWasm(); dsp.setMode(1); // highpass
    let inE = 0, outE = 0;
    for (let b = 0; b < 8; b++) {
      const inp = zeros();
      for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 80 * (b * N + i)) / SR);
      const out = dsp.process(inp, { cutoff: 2000, resonance: 0.1 });
      if (b >= 4) { inE += energy(inp); outE += energy(out); }
    }
    expect(outE / inE).toBeLessThan(0.5); // an 80 Hz tone is cut by a 2 kHz highpass
  });
});
