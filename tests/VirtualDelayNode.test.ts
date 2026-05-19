import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualDelayNode } from '../src/virtualNodes/VirtualDelayNode';

const mockDelayNode = () => ({
  delayTime: { value: 0 },
  connect: () => {},
  disconnect: () => {},
});

const mockAudioContext = () => ({
  createDelay: (_maxDelay?: number) => mockDelayNode(),
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'delay-1',
  data: { delayTime: 500, ...overrides },
});

describe('VirtualDelayNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('render converts milliseconds to seconds', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.render(1000); // 1000ms → 1s
    expect((dn.audioNode as any).delayTime.value).toBeCloseTo(1, 5);
  });

  it('render with 500ms sets 0.5s', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.render(500);
    expect((dn.audioNode as any).delayTime.value).toBeCloseTo(0.5, 5);
  });

  it('handleUpdateParams converts delayTime ms to seconds', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.handleUpdateParams(node as any, { data: { delayTime: 2000 } });
    expect((dn.audioNode as any).delayTime.value).toBeCloseTo(2, 5);
  });

  it('handleUpdateParams clamps delayTime to MAX_SECONDS (30s)', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.handleUpdateParams(node as any, { data: { delayTime: 999999 } });
    expect((dn.audioNode as any).delayTime.value).toBeLessThanOrEqual(30);
  });

  it('handleUpdateParams clamps negative values to 0', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.handleUpdateParams(node as any, { data: { delayTime: -500 } });
    expect((dn.audioNode as any).delayTime.value).toBe(0);
  });

  it('mirrors delayTime into node.data', () => {
    const node = makeNode();
    const dn = new VirtualDelayNode(mockAudioContext(), bus, node as any);
    dn.handleUpdateParams(node as any, { data: { delayTime: 300 } });
    expect((node.data as any).delayTime).toBe(300);
  });
});
