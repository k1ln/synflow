import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import EventBus from '../src/sys/EventBus';
import { VirtualRingModNode } from '../src/virtualNodes/VirtualRingModNode';

const mockGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
const mockAudioContext = () => ({
  audioWorklet: { addModule: vi.fn(async () => {}) },
  createGain: vi.fn(() => mockGain()),
  currentTime: 0,
} as any);

const makeNode = () => ({ id: 'ring-1', data: {} });

describe('VirtualRingModNode', () => {
  let bus: EventBus;
  beforeEach(() => { bus = new (EventBus as any)(); });

  it('constructs without throwing', () => {
    expect(() => new VirtualRingModNode(mockAudioContext(), bus, makeNode() as any)).not.toThrow();
  });

  it('exposes a/b/main-input handles', () => {
    const n = new VirtualRingModNode(mockAudioContext(), bus, makeNode() as any);
    expect(n.connectHandleNames).toEqual(['main-input', 'a', 'b']);
  });

  it('routes a/main-input to input A and b to input B', () => {
    const n = new VirtualRingModNode(mockAudioContext(), bus, makeNode() as any);
    const sa = { connect: vi.fn() } as any;
    const sb = { connect: vi.fn() } as any;
    const sm = { connect: vi.fn() } as any;
    n.connectToInput(sa, 'a');
    n.connectToInput(sb, 'b');
    n.connectToInput(sm, 'main-input');
    expect(sa.connect).toHaveBeenCalledWith((n as any).inputA);
    expect(sb.connect).toHaveBeenCalledWith((n as any).inputB);
    expect(sm.connect).toHaveBeenCalledWith((n as any).inputA);
  });

  it('connect/disconnect do not throw', () => {
    const n = new VirtualRingModNode(mockAudioContext(), bus, makeNode() as any);
    expect(() => n.connect({} as any)).not.toThrow();
    expect(() => n.disconnect()).not.toThrow();
  });
});

// ── DSP: load the real processor and verify a*b ───────────────────────────────
function loadProcessor(): any {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'public/RingModProcessor.js'), 'utf8');
  let Captured: any;
  const sandbox: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { onmessage: null as any, postMessage() {} }; },
    registerProcessor: (_n: string, cls: any) => { Captured = cls; },
    sampleRate: 44100,
    Math,
  };
  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  return Captured;
}

describe('RingModProcessor (DSP)', () => {
  const Proc = loadProcessor();

  it('multiplies the two inputs sample-by-sample', () => {
    const p = new Proc();
    const a = new Float32Array([1, 0.5, -0.5, 2]);
    const b = new Float32Array([1, 2, 4, 0.5]);
    const out = new Float32Array(4);
    p.process([[a], [b]], [[out]], {});
    expect(Array.from(out)).toEqual([1, 1, -2, 1]);
  });

  it('passes A through when B is absent (no silencing)', () => {
    const p = new Proc();
    const a = new Float32Array([0.3, -0.7]);
    const out = new Float32Array(2);
    p.process([[a], []], [[out]], {});
    expect(out[0]).toBeCloseTo(0.3, 5);
    expect(out[1]).toBeCloseTo(-0.7, 5);
  });

  it('emits silence when neither input is present', () => {
    const p = new Proc();
    const out = new Float32Array(4).fill(5);
    p.process([[], []], [[out]], {});
    expect(out.every((x: number) => x === 0)).toBe(true);
  });
});
