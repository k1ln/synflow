import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualDistortionNode } from '../src/virtualNodes/VirtualDistortionNode';

const mockWaveShaper = () => ({
  curve: null as Float32Array | null,
  oversample: 'none' as OverSampleType,
  connect: () => {},
  disconnect: () => {},
});

const mockAudioContext = () => ({
  createWaveShaper: mockWaveShaper,
  currentTime: 0,
} as any);

const makeNode = (overrides: any = {}) => ({
  id: 'dist-1',
  data: { drive: 0.5, ...overrides },
});

describe('VirtualDistortionNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('render sets curve on the audio node', () => {
    const node = makeNode();
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    const curve = new Float32Array([0, 0.5, 1]);
    d.render(curve);
    expect(d.audioNode!.curve).toBe(curve);
  });

  it('render sets oversample', () => {
    const node = makeNode();
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    d.render(null, '2x');
    expect(d.audioNode!.oversample).toBe('2x');
  });

  it('handleUpdateParams parses comma-separated curve string', () => {
    const node = makeNode();
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    d.handleUpdateParams(node as any, { data: { curve: '-1,0,1' } });
    expect(d.audioNode!.curve).toBeInstanceOf(Float32Array);
    expect(d.audioNode!.curve![0]).toBe(-1);
    expect(d.audioNode!.curve![2]).toBe(1);
  });

  it('handleUpdateParams with array curve', () => {
    const node = makeNode();
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    d.handleUpdateParams(node as any, { data: { curve: [-1, 0, 1] } });
    expect(d.audioNode!.curve).toBeInstanceOf(Float32Array);
  });

  it('handleUpdateParams stores drive in node.data', () => {
    const node = makeNode({ drive: 0 });
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    d.handleUpdateParams(node as any, { data: { drive: 0.8 } });
    expect((node.data as any).drive).toBe(0.8);
  });

  it('render with null curve sets curve to null', () => {
    const node = makeNode();
    const d = new VirtualDistortionNode(mockAudioContext(), bus, node as any);
    const curve = new Float32Array([0, 1]);
    d.render(curve);
    d.render(null);
    expect(d.audioNode!.curve).toBeNull();
  });
});
