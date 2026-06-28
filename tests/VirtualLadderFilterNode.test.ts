import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualLadderFilterNode } from '../src/virtualNodes/VirtualLadderFilterNode';

// In the node test env there is no AudioWorkletNode global, so initWorklet()
// throws and is caught internally — the virtual node still constructs and its
// pure control methods remain testable.
const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'ladder-1', data });

describe('VirtualLadderFilterNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'cutoff', 'resonance']);
  });

  it('setPoles maps 12/24 dB (or 2/4) to two/four poles', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any);
    n.setPoles(2); expect((n as any).initial.poles).toBe(2);
    n.setPoles(12); expect((n as any).initial.poles).toBe(2);
    n.setPoles(4); expect((n as any).initial.poles).toBe(4);
    n.setPoles(24); expect((n as any).initial.poles).toBe(4);
    n.setPoles('garbage'); expect((n as any).initial.poles).toBe(4);
  });

  it('caches initial continuous params from node data', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode({ cutoff: 800, resonance: 0.7, drive: 5 }) as any);
    expect((n as any).initial).toMatchObject({ cutoff: 800, resonance: 0.7, drive: 5 });
  });

  it('handleUpdateParams routes poles to setPoles', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any);
    const spy = vi.spyOn(n, 'setPoles');
    n.handleUpdateParams(makeNode() as any, { data: { poles: 2 } });
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('connectToInput buffers param-mod inputs until worklet ready', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'cutoff');
    expect((n as any).pendingParamInputs).toHaveLength(1);
    expect(src.connect).not.toHaveBeenCalled();
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualLadderFilterNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise ladder_process ─────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/ladder.wasm'));
  const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const w: any = inst.exports;
  const state = w.ladder_new();
  const pIn = w.alloc_f32(N), pCut = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    setPoles: (p: number) => w.ladder_set_poles(state, p),
    process: (input: Float32Array | null, { resonance = 0.3, drive = 1, cutoff = 1000 } = {}) => {
      const m = view();
      if (input) m.set(input, pIn >> 2);
      m[pCut >> 2] = cutoff;
      w.ladder_process(state, pIn, input ? 1 : 0, pCut, 1, resonance, drive, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
const zeros = () => new Float32Array(N);

describe('ladder.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/ladder.wasm'));
    const names = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'ladder_new', 'ladder_process', 'ladder_set_poles']));
  });

  it('lowpass impulse response is finite and rings then decays', () => {
    const dsp = loadWasm();
    const impulse = zeros(); impulse[0] = 1;
    const out0 = dsp.process(impulse, { resonance: 0.5 });
    expect(out0.every((x) => Number.isFinite(x))).toBe(true);
    expect(energy(out0)).toBeGreaterThan(0);

    const prevE = energy(out0);
    let lastE = prevE;
    for (let b = 0; b < 12; b++) {
      const out = dsp.process(zeros(), { resonance: 0.5 });
      expect(out.every((x) => Number.isFinite(x))).toBe(true);
      lastE = energy(out);
    }
    expect(lastE).toBeLessThan(prevE);
  });

  it('emits silence (no NaN) when no input is connected', () => {
    const dsp = loadWasm();
    const out = dsp.process(null);
    expect(out.every((x) => x === 0)).toBe(true);
  });

  it('stays finite at high drive + max resonance (self-osc region)', () => {
    const dsp = loadWasm();
    for (let b = 0; b < 24; b++) {
      const inp = zeros();
      for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 110 * (b * N + i)) / SR);
      const out = dsp.process(inp, { drive: 20, resonance: 1, cutoff: 1500 });
      expect(out.every((x) => Number.isFinite(x))).toBe(true);
    }
  });

  it('attenuates content well above the cutoff (lowpass behavior)', () => {
    const dsp = loadWasm();
    let inE = 0, outE = 0;
    for (let b = 0; b < 8; b++) {
      const inp = zeros();
      for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 8000 * (b * N + i)) / SR);
      const out = dsp.process(inp, { cutoff: 300, resonance: 0.1 });
      if (b >= 4) { inE += energy(inp); outE += energy(out); }
    }
    const ratio = outE / inE;
    expect(ratio).toBeLessThan(0.2);
    expect(Number.isFinite(ratio)).toBe(true);
  });

  it('2-pole tap is brighter (more output energy) than 4-pole at the same cutoff', () => {
    const drive4 = loadWasm(); drive4.setPoles(4);
    const drive2 = loadWasm(); drive2.setPoles(2);
    const tone = (b: number) => { const inp = zeros(); for (let i = 0; i < N; i++) inp[i] = Math.sin((2 * Math.PI * 2000 * (b * N + i)) / SR); return inp; };
    let e4 = 0, e2 = 0;
    for (let b = 0; b < 12; b++) { const o4 = drive4.process(tone(b), { cutoff: 600, resonance: 0.2 }); const o2 = drive2.process(tone(b), { cutoff: 600, resonance: 0.2 }); if (b >= 6) { e4 += energy(o4); e2 += energy(o2); } }
    expect(e2).toBeGreaterThan(e4); // 12 dB/oct passes more above cutoff than 24 dB/oct
  });
});
