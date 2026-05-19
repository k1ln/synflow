import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualMidiKnobNode from '../src/virtualNodes/VirtualMidiKnobNode';

vi.mock('../src/components/MidiManager', () => ({
  default: {
    getInstance: () => ({
      ensureAccess: async () => {},
      onMessage: () => () => {},
      cancelButtonLearn: () => {},
    }),
  },
}));

const makeNode = (overrides: any = {}) => ({
  id: 'knob-1',
  data: { value: 0.5, min: 0, max: 1, curve: 'linear', ...overrides },
});

describe('VirtualMidiKnobNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('calls handleConnectedEdges with current value on main-input trigger', async () => {
    const cb = vi.fn();
    const node = makeNode({ value: 0.75 });
    new VirtualMidiKnobNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [, data] = cb.mock.calls.find(([, d]) => (d as any).value === 0.75) || cb.mock.calls[0];
    expect((data as any).value).toBe(0.75);
  });

  it('params update changes value and re-emits', async () => {
    const cb = vi.fn();
    const node = makeNode({ value: 0 });
    new VirtualMidiKnobNode(bus, node as any, cb);

    bus.emit(node.id + '.params.updateParams', { data: { value: 0.9 } });
    await new Promise(r => setTimeout(r, 20));

    const calls = cb.mock.calls.map(([, d]) => (d as any).value);
    expect(calls).toContain(0.9);
  });

  it('handleUpdateParams updates value directly', async () => {
    const cb = vi.fn();
    const node = makeNode({ value: 0.2 });
    const knob = new VirtualMidiKnobNode(bus, node as any, cb);

    knob.handleUpdateParams(node, { data: { value: 0.6 } });
    await new Promise(r => setTimeout(r, 20));

    const calls = cb.mock.calls.map(([, d]) => (d as any).value);
    expect(calls).toContain(0.6);
  });
});
