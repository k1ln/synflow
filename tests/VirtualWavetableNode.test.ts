import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualWavetableNode } from '../src/virtualNodes/VirtualWavetableNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'wt-1', data });

describe('VirtualWavetableNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'frequency', 'position', 'warp']);
  });

  it('reads config from node data', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode({ mode: 1, unison: 5, detune: 22, position: 0.4, warp: 0.6, attack: 0.2 }) as any);
    expect((n as any).initial).toMatchObject({ mode: 1, unison: 5, detune: 22, position: 0.4, warp: 0.6, a: 0.2 });
  });

  it('handleUpdateParams updates cached config', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any);
    n.handleUpdateParams(makeNode() as any, { data: { unison: 7, detune: 30 } });
    expect((n as any).initial.unison).toBe(7);
    expect((n as any).initial.detune).toBe(30);
  });

  it('a note-on event does not throw before the worklet is ready', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => bus.emit('wt-1.main-input.receiveNodeOn', { velocity: 1 })).not.toThrow();
  });

  it('connectToInput buffers position/warp/frequency mod inputs until worklet ready', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any);
    const a = { connect: vi.fn() } as any; const b = { connect: vi.fn() } as any;
    n.connectToInput(a, 'position');
    n.connectToInput(b, 'warp');
    expect((n as any).pendingParamInputs).toHaveLength(2);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualWavetableNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise wavetable_process ──────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/wavetable.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.wavetable_new();
  const pFreq = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    state, w,
    config: ({ mode = 0, unison = 1, detune = 12, env = { a: 0.001, d: 0.05, s: 0.8, r: 0.05 } } = {}) => w.wavetable_set_config(state, mode, unison, detune, env.a, env.d, env.s, env.r),
    gateOn: (v = 1) => w.wavetable_gate_on(state, v),
    process: ({ freq = 220, pos = 0, warp = 0 } = {}) => {
      const m = view(); m[pFreq >> 2] = freq;
      w.wavetable_process(state, pFreq, 1, pos, warp, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);

describe('wavetable.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/wavetable.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'wavetable_new', 'wavetable_set_config', 'wavetable_gate_on', 'wavetable_gate_off', 'wavetable_process']));
  });

  it('is silent until a note is gated on', () => {
    const dsp = loadWasm(); dsp.config();
    for (let b = 0; b < 4; b++) expect(energy(dsp.process())).toBe(0);
  });

  it('a note-on produces sound (wavetable mode)', () => {
    const dsp = loadWasm(); dsp.config(); dsp.gateOn(1);
    let e = 0;
    for (let b = 0; b < 12; b++) { const out = dsp.process(); if (b >= 2) e += energy(out); }
    expect(e).toBeGreaterThan(0);
    expect(Number.isFinite(e)).toBe(true);
  });

  it('the position knob morphs the timbre', () => {
    const dsp = loadWasm(); dsp.config(); dsp.gateOn(1);
    for (let b = 0; b < 30; b++) dsp.process();
    let e0 = 0; for (let b = 0; b < 24; b++) e0 += energy(dsp.process({ pos: 0 }));   // sine frame
    let e1 = 0; for (let b = 0; b < 24; b++) e1 += energy(dsp.process({ pos: 0.6 })); // brighter frame
    expect(e0).toBeGreaterThan(0); expect(e1).toBeGreaterThan(0);
    expect(Math.abs(e0 - e1) / e0).toBeGreaterThan(0.03);
  });

  it('phase-distortion mode produces sound and stays finite', () => {
    const dsp = loadWasm(); dsp.config({ mode: 1 }); dsp.gateOn(1);
    let e = 0;
    for (let b = 0; b < 16; b++) { const out = dsp.process({ warp: 0.85 }); expect(out.every((x) => Number.isFinite(x))).toBe(true); if (b >= 2) e += energy(out); }
    expect(e).toBeGreaterThan(0);
  });

  it('stays finite with 7-voice unison', () => {
    const dsp = loadWasm(); dsp.config({ unison: 7, detune: 40 }); dsp.gateOn(1);
    for (let b = 0; b < 20; b++) expect(dsp.process({ pos: 0.5, warp: 0.5 }).every((x) => Number.isFinite(x))).toBe(true);
  });
});
