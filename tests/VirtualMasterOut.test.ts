import { describe, it, expect } from 'vitest';
import EventBus from '../src/sys/EventBus';
import VirtualMasterOut from '../src/virtualNodes/VirtualMasterOut';

const mockAudioContext = () => ({
  destination: {},
  currentTime: 0,
} as any);

const makeNode = () => ({ id: 'master-out-1', data: {} } as any);

describe('VirtualMasterOut', () => {
  it('stores audioContext as audioNode', () => {
    const ctx = mockAudioContext();
    const bus = new (EventBus as any)();
    const n = new VirtualMasterOut(ctx, bus, makeNode());
    expect(n.audioNode).toBe(ctx);
  });

  it('stores the event bus', () => {
    const ctx = mockAudioContext();
    const bus = new (EventBus as any)();
    const n = new VirtualMasterOut(ctx, bus, makeNode());
    expect(n.eventBus).toBe(bus);
  });

  it('stores the node reference', () => {
    const ctx = mockAudioContext();
    const bus = new (EventBus as any)();
    const node = makeNode();
    const n = new VirtualMasterOut(ctx, bus, node);
    expect(n.node).toBe(node);
  });
});
