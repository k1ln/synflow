import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualDynamicCompressorNode } from '../src/virtualNodes/VirtualDynamicCompressorNode';

const mockParam = (v = 0) => ({ value: v });
const mockCompressorNode = () => ({
  threshold: mockParam(-24),
  knee: mockParam(30),
  ratio: mockParam(12),
  attack: mockParam(0.003),
  release: mockParam(0.25),
  connect: () => {},
  disconnect: () => {},
});
const mockAudioContext = () => ({
  createDynamicsCompressor: mockCompressorNode,
  currentTime: 0,
} as any);

const makeNode = () => ({ id: 'comp-1', data: {} });

describe('VirtualDynamicCompressorNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('render sets threshold', () => {
    const node = makeNode();
    const c = new VirtualDynamicCompressorNode(mockAudioContext(), bus, node as any);
    c.render(-30);
    expect(c.audioNode!.threshold.value).toBe(-30);
  });

  it('render sets knee', () => {
    const node = makeNode();
    const c = new VirtualDynamicCompressorNode(mockAudioContext(), bus, node as any);
    c.render(-24, 10);
    expect(c.audioNode!.knee.value).toBe(10);
  });

  it('render sets ratio', () => {
    const node = makeNode();
    const c = new VirtualDynamicCompressorNode(mockAudioContext(), bus, node as any);
    c.render(-24, 30, 4);
    expect(c.audioNode!.ratio.value).toBe(4);
  });

  it('render sets attack and release', () => {
    const node = makeNode();
    const c = new VirtualDynamicCompressorNode(mockAudioContext(), bus, node as any);
    c.render(-24, 30, 12, 0.01, 0.5);
    expect(c.audioNode!.attack.value).toBe(0.01);
    expect(c.audioNode!.release.value).toBe(0.5);
  });

  it('render uses sensible defaults', () => {
    const node = makeNode();
    const c = new VirtualDynamicCompressorNode(mockAudioContext(), bus, node as any);
    c.render();
    expect(c.audioNode!.threshold.value).toBe(-24);
    expect(c.audioNode!.ratio.value).toBe(12);
  });
});
