import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/sys/wasmUtils', () => ({ compileWasmModule: vi.fn(async () => ({})) }));

import EventBus from '../src/sys/EventBus';
import { VirtualAudioSignalFreqShifterNode } from '../src/virtualNodes/VirtualAudioSignalFreqShifterNode';

const makeWorkletNode = () => {
  const shiftParam = { value: 0 };
  const params = new Map([['shift', shiftParam]]);
  return {
    parameters: params,
    port: { postMessage: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
};

const mockAudioContext = () => {
  const worklet = makeWorkletNode();
  return {
    _worklet: worklet,
    audioWorklet: { addModule: vi.fn(async () => {}) },
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
    currentTime: 0,
    _createWorkletNode: () => worklet,
  } as any;
};

const makeNode = (shift = 0) => ({
  id: 'freqshift-1',
  data: { shift },
});

describe('VirtualAudioSignalFreqShifterNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    expect(() => new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any)).not.toThrow();
  });

  it('setShift clamps to [-96, 96]', () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    n.setShift(200);
    expect((n as any).shift).toBe(96);
    n.setShift(-200);
    expect((n as any).shift).toBe(-96);
  });

  it('setShift stores exact value within range', () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    n.setShift(12);
    expect((n as any).shift).toBe(12);
  });

  it('render calls setShift when shift is provided', () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    const spy = vi.spyOn(n, 'setShift');
    n.render(7);
    expect(spy).toHaveBeenCalledWith(7);
  });

  it('render is no-op when no argument', () => {
    const ctx = mockAudioContext();
    const node = makeNode(3);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    const spy = vi.spyOn(n, 'setShift');
    n.render();
    expect(spy).not.toHaveBeenCalled();
  });

  it('params.updateParams event triggers setShift', async () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    const spy = vi.spyOn(n, 'setShift');
    bus.emit('freqshift-1.params.updateParams', { data: { shift: 24 } });
    await new Promise(r => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledWith(24);
  });

  it('dispose does not throw', () => {
    const ctx = mockAudioContext();
    const node = makeNode(0);
    const n = new VirtualAudioSignalFreqShifterNode(ctx, bus, node as any);
    expect(() => n.dispose()).not.toThrow();
  });
});
