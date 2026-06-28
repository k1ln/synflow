import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';

// Mock RTCPeerConnection so the nodes never actually try to connect
vi.stubGlobal('RTCPeerConnection', vi.fn(() => ({
  addTrack: vi.fn(),
  close: vi.fn(),
  createOffer: vi.fn().mockResolvedValue({}),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  onicecandidate: null,
  ontrack: null,
  onconnectionstatechange: null,
  connectionState: 'new',
})));

const makeGainNode = () => ({
  gain: { value: 1, setTargetAtTime: vi.fn() },
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const makeDestNode = () => ({
  stream: {},
});

const mockCtx = () => ({
  currentTime: 0,
  createGain: vi.fn(makeGainNode),
  createMediaStreamDestination: vi.fn(makeDestNode),
} as any);

const makeNode = (data: any = {}) => ({ id: 'rtc-1', data });

describe('VirtualWebRTCOutputNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', async () => {
    const { VirtualWebRTCOutputNode } = await import('../src/virtualNodes/VirtualWebRTCOutputNode');
    const ctx = mockCtx();
    expect(() => new VirtualWebRTCOutputNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('audioNode is the input gain node', async () => {
    const { VirtualWebRTCOutputNode } = await import('../src/virtualNodes/VirtualWebRTCOutputNode');
    const ctx = mockCtx();
    const n = new VirtualWebRTCOutputNode(ctx, bus, makeNode() as any);
    expect(n.audioNode).toBeDefined();
    expect((n.audioNode as any).gain).toBeDefined();
  });

  it('handleUpdateParams with no session change does not throw', async () => {
    const { VirtualWebRTCOutputNode } = await import('../src/virtualNodes/VirtualWebRTCOutputNode');
    const ctx = mockCtx();
    const node = makeNode({ sessionId: 'abc', serverUrl: 'http://x' });
    const n = new VirtualWebRTCOutputNode(ctx, bus, node as any);
    expect(() => n.handleUpdateParams(node as any, { data: { sessionId: 'abc' } })).not.toThrow();
  });
});

describe('VirtualWebRTCInputNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', async () => {
    const { VirtualWebRTCInputNode } = await import('../src/virtualNodes/VirtualWebRTCInputNode');
    const ctx = mockCtx();
    expect(() => new VirtualWebRTCInputNode(ctx, bus, makeNode() as any)).not.toThrow();
  });

  it('audioNode is the output gain node', async () => {
    const { VirtualWebRTCInputNode } = await import('../src/virtualNodes/VirtualWebRTCInputNode');
    const ctx = mockCtx();
    const n = new VirtualWebRTCInputNode(ctx, bus, makeNode() as any);
    expect(n.audioNode).toBeDefined();
    expect((n.audioNode as any).gain).toBeDefined();
  });
});
