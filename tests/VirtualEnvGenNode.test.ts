import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualEnvGenNode } from '../src/virtualNodes/VirtualEnvGenNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = (data: Record<string, unknown> = {}) => ({ id: 'env-1', data });

describe('VirtualEnvGenNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualEnvGenNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('caches initial params from node data', () => {
    const n = new VirtualEnvGenNode(mockAudioContext(), bus, makeNode({ attack: 0.2, decay: 0.4, sustain: 0.3, release: 0.5, amount: 3000, bias: 100 }) as any);
    expect((n as any).initial).toMatchObject({ attack: 0.2, decay: 0.4, sustain: 0.3, release: 0.5, amount: 3000, bias: 100 });
  });

  it('a note-on/off event does not throw before the worklet is ready', () => {
    const n = new VirtualEnvGenNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => { bus.emit('env-1.main-input.receiveNodeOn', {}); bus.emit('env-1.main-input.receiveNodeOff', {}); }).not.toThrow();
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualEnvGenNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real Rust/WASM core and exercise env_process ────────────────
const SR = 44100;
const N = 128;
function loadWasm() {
  const bytes = fs.readFileSync(path.resolve(process.cwd(), 'public/envgen.wasm'));
  const w: any = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  const state = w.env_new();
  const pOut = w.alloc_f32(N);
  const view = () => new Float32Array(w.memory.buffer);
  return {
    gateOn: () => w.env_gate_on(state),
    gateOff: () => w.env_gate_off(state),
    process: ({ a = 0.002, d = 0.05, s = 0.5, r = 0.05, amount = 1, bias = 0 } = {}) => {
      w.env_process(state, N, SR, pOut, a, d, s, r, amount, bias);
      return view().slice(pOut >> 2, (pOut >> 2) + N);
    },
  };
}
const last = (a: Float32Array) => a[a.length - 1];

describe('envgen.wasm (DSP)', () => {
  it('exports the expected ABI', () => {
    const names = WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.resolve(process.cwd(), 'public/envgen.wasm')))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['memory', 'alloc_f32', 'env_new', 'env_gate_on', 'env_gate_off', 'env_process']));
  });

  it('outputs the bias level when idle', () => {
    const dsp = loadWasm();
    const out = dsp.process({ amount: 1000, bias: 200 });
    expect(out.every((x) => x === 200)).toBe(true); // env=0 → bias only
  });

  it('rises to amount+bias on gate-on, then releases back to bias', () => {
    const dsp = loadWasm();
    dsp.gateOn();
    let peak = 0;
    for (let b = 0; b < 40; b++) peak = Math.max(peak, last(dsp.process({ amount: 1000, bias: 100 })));
    expect(peak).toBeGreaterThan(500);            // env opened up toward amount(=1000)+bias
    dsp.gateOff();
    let lvl = peak;
    for (let b = 0; b < 60; b++) lvl = last(dsp.process({ amount: 1000, bias: 100 }));
    expect(lvl).toBeCloseTo(100, 0);              // released back to bias
  });

  it('reaches sustain (amount*sustain + bias) and holds', () => {
    const dsp = loadWasm();
    dsp.gateOn();
    let lvl = 0;
    for (let b = 0; b < 80; b++) lvl = last(dsp.process({ a: 0.001, d: 0.01, s: 0.5, amount: 1000, bias: 0 }));
    expect(lvl).toBeCloseTo(500, -1); // amount*sustain = 1000*0.5
  });
});
