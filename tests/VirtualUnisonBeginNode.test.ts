import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualUnisonBeginNode } from '../src/virtualNodes/VirtualUnisonBeginNode';

const makeNode = (overrides: any = {}) => ({
  id: 'unison-1',
  data: {
    numberOfVoices: 2,
    detuneFreqDeviation: 0,
    gainDeviation: 0,
    msTimeStartDeviation: 0,
    msTimeEndDeviation: 0,
    ...overrides,
  },
});

describe('VirtualUnisonBeginNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('emits receiveNodeOn to handleConnectedEdges for each voice', async () => {
    const cb = vi.fn();
    const node = makeNode({ numberOfVoices: 3 });
    new VirtualUnisonBeginNode(undefined, bus, node as any, cb, () => undefined);

    bus.emit(node.id + '.unison-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    // 3 voices → 3 callbacks
    expect(cb).toHaveBeenCalledTimes(3);
    cb.mock.calls.forEach(([, data]) => expect((data as any).frequency).toBe(440));
  });

  it('emits receiveNodeOff to handleConnectedEdges for each voice', async () => {
    const cb = vi.fn();
    const node = makeNode({ numberOfVoices: 2 });
    new VirtualUnisonBeginNode(undefined, bus, node as any, cb, () => undefined);

    bus.emit(node.id + '.unison-input.receiveNodeOff', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalledTimes(2);
    cb.mock.calls.forEach(([,, eventType]) => expect(eventType).toBe('receiveNodeOff'));
  });

  it('numberOfVoices=1 emits once', async () => {
    const cb = vi.fn();
    const node = makeNode({ numberOfVoices: 1 });
    new VirtualUnisonBeginNode(undefined, bus, node as any, cb, () => undefined);

    bus.emit(node.id + '.unison-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('setUnisonNodes updates the voice routing references', () => {
    const cb = vi.fn();
    const node = makeNode();
    const u = new VirtualUnisonBeginNode(undefined, bus, node as any, cb, () => undefined);
    const mockNodes = [{ id: 'voice-0' }, { id: 'voice-1' }];
    expect(() => u.setUnisonNodes(mockNodes as any)).not.toThrow();
  });

  it('detuneFreqDeviation 0 passes through frequency unchanged', async () => {
    const cb = vi.fn();
    const node = makeNode({ numberOfVoices: 1, detuneFreqDeviation: 0 });
    new VirtualUnisonBeginNode(undefined, bus, node as any, cb, () => undefined);

    bus.emit(node.id + '.unison-input.receiveNodeOn', { frequency: 440 });
    await new Promise(r => setTimeout(r, 20));

    const [, data] = cb.mock.calls[0];
    expect((data as any).frequency).toBe(440);
  });
});
