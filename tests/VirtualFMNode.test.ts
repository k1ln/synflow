import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualFMNode } from '../src/virtualNodes/VirtualFMNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'fm-1', data });

describe('VirtualFMNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualFMNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes named audio-input handles', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'frequency']);
  });

  it('reads operator config from node data', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode({ algorithm: 3, feedback: 0.5, attack: 0.1, ratio0: 2, level0: 0.4, ratio1: 7, level1: 0.9 }) as any);
    const cfg = (n as any).cfg;
    expect(cfg.algorithm).toBe(3);
    expect(cfg.feedback).toBe(0.5);
    expect(cfg.a).toBe(0.1);
    expect(cfg.ratios[0]).toBe(2);
    expect(cfg.levels[0]).toBe(0.4);
    expect(cfg.ratios[1]).toBe(7);
    expect(cfg.levels[1]).toBe(0.9);
  });

  it('handleUpdateParams updates the cached config', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode() as any);
    n.handleUpdateParams(makeNode() as any, { data: { level2: 0.77, algorithm: 6 } });
    expect((n as any).cfg.levels[2]).toBe(0.77);
    expect((n as any).cfg.algorithm).toBe(6);
  });

  it('a note-on event does not throw before the worklet is ready', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => bus.emit('fm-1.main-input.receiveNodeOn', { velocity: 1 })).not.toThrow();
  });

  it('connectToInput buffers frequency-mod inputs until worklet ready', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode() as any);
    const src = { connect: vi.fn() } as any;
    n.connectToInput(src, 'frequency');
    expect((n as any).pendingParamInputs).toHaveLength(1);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualFMNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise fm_process ─────────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/fm.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.fm_new();
  const pR = w.alloc_f32(6), pL = w.alloc_f32(6), pFreq = w.alloc_f32(N), pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    config: ({ ratios = [1, 2, 1, 1, 1, 1], levels = [1, 0.8, 0, 0, 0, 0], feedback = 0, algorithm = 1, env = { a: 0.001, d: 0.1, s: 0.8, r: 0.08 } } = {}) => {
      const m = view();
      m.set(ratios, pR >> 2); m.set(levels, pL >> 2);
      w.fm_set_config(state, pR, pL, feedback, algorithm, env.a, env.d, env.s, env.r);
    },
    gateOn: (v = 1) => w.fm_gate_on(state, v),
    gateOff: () => w.fm_gate_off(state),
    process: (freq = 220) => {
      const m = view(); m[pFreq >> 2] = freq;
      w.fm_process(state, pFreq, 1, N, SR, pOut);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);

describe('fm.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/fm.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'fm_new', 'fm_set_config', 'fm_gate_on', 'fm_gate_off', 'fm_process']));
  });

  it('is silent until a note is gated on', () => {
    const dsp = loadWasm(); dsp.config();
    for (let b = 0; b < 4; b++) expect(energy(dsp.process())).toBe(0);
  });

  it('a note-on produces sound (2-op FM)', () => {
    const dsp = loadWasm(); dsp.config(); dsp.gateOn(1);
    let e = 0;
    for (let b = 0; b < 10; b++) { const out = dsp.process(); if (b >= 2) e += energy(out); }
    expect(e).toBeGreaterThan(0);
    expect(Number.isFinite(e)).toBe(true);
  });

  it('a note-off releases the envelope to silence', () => {
    const dsp = loadWasm(); dsp.config(); dsp.gateOn(1);
    for (let b = 0; b < 20; b++) dsp.process();
    const sustainE = energy(dsp.process());
    expect(sustainE).toBeGreaterThan(0);
    dsp.gateOff();
    let lateE = sustainE;
    for (let b = 0; b < 60; b++) lateE = energy(dsp.process());
    expect(lateE).toBeLessThan(sustainE);
  });

  it('stays finite with max feedback + full 6-op stack', () => {
    const dsp = loadWasm();
    dsp.config({ algorithm: 7, levels: [1, 1, 1, 1, 1, 1], feedback: 1, env: { a: 0.001, d: 0.1, s: 1, r: 0.1 } });
    dsp.gateOn(1);
    for (let b = 0; b < 60; b++) expect(dsp.process().every((x) => Number.isFinite(x))).toBe(true);
  });
});
