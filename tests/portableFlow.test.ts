import { describe, it, expect, vi } from 'vitest';
import { AudioGraphManager, EventBus } from '@synflow/core';

// Mock the browser storage the exporter wraps, so we can run it in node.
vi.mock('../src/host/browserFlowLoader', () => ({
  browserFlowLoader: async (name: string) =>
    name === 'sub'
      ? { nodes: [{ id: 'inner.GainFlowNode', type: 'GainFlowNode', data: { gain: 0.3 } }], edges: [] }
      : null,
}));
vi.mock('../src/host/browserAssetStore', () => ({
  browserAssetStore: {
    loadAudio: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    saveAudio: async () => ({ ok: true }),
  },
}));

function mockCtx(): any {
  const node = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { createGain: node, destination: { connect() {}, disconnect() {} }, currentTime: 0 };
}

describe('exportPortableFlow', () => {
  it('inlines sub-flows and embeds sample bytes (base64), clearing diskFileName', async () => {
    const { exportPortableFlow } = await import('../src/host/exportPortableFlow');
    const flow = {
      nodes: [
        { id: 'f.FlowNode', type: 'FlowNode', data: { selectedNode: 'sub', onChange: () => {} } },
        { id: 's.SampleFlowNode', type: 'SampleFlowNode', data: { diskFileName: 'kick.wav' } },
      ],
      edges: [],
    };
    const portable = await exportPortableFlow(flow);

    const flowNode = portable.nodes.find((n: any) => n.id === 'f.FlowNode');
    expect(flowNode.data.embeddedFlow).toBeTruthy();
    expect(flowNode.data.embeddedFlow.nodes[0].type).toBe('GainFlowNode');
    expect(flowNode.data.onChange).toBeUndefined(); // functions stripped

    const sample = portable.nodes.find((n: any) => n.id === 's.SampleFlowNode');
    expect(typeof sample.data.arrayBuffer).toBe('string'); // base64
    expect(sample.data.diskFileName).toBeUndefined();
  });
});

describe('portable flow consumption (headless, no flowLoader)', () => {
  it('builds an embedded sub-flow with no FlowLoader injected', async () => {
    const nodes = [{
      id: 'f.FlowNode',
      type: 'FlowNode',
      data: { embeddedFlow: { nodes: [{ id: 'g.GainFlowNode', type: 'GainFlowNode', data: { gain: 0.3 } }], edges: [] } },
    }];
    const mgr = new AudioGraphManager(mockCtx(), { current: nodes } as any, { current: [] } as any, { bus: new EventBus() });
    await mgr.initialize();
    // Sub-flow node is created with the parent-prefixed id — proves no loader needed.
    expect(mgr.virtualNodes.has('f.FlowNode.g.GainFlowNode')).toBe(true);
  });
});
