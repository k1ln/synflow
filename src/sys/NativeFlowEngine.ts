import type { RefObject } from 'react';
import type { IFlowEngine } from './IFlowEngine';
import EventBus from './EventBus';

// Strip functions / non-JSON bits from the live graph -> the shared flow-JSON
// contract the C++ FlowLoader reads. (Sub-flow embedding, as in
// exportPortableFlow, can be layered in later for nested flows.)
function serializeFlow(nodes: any[] | null, edges: any[] | null): unknown {
  return JSON.parse(JSON.stringify({ nodes: nodes || [], edges: edges || [] }));
}

// The WebBrowserComponent native bridge (present only inside the plugin webview).
function emit(event: string, payload: unknown): void {
  try {
    (window as any).__JUCE__?.backend?.emitEvent(event, payload);
  } catch {
    /* webview/bridge not ready */
  }
}

/**
 * Native-mode engine (implements IFlowEngine). The editor renders the graph but
 * audio is produced by the C++ plugin engine, not Web Audio: instead of building
 * a Web Audio graph it serializes the SAME node/edge refs to flow JSON and ships
 * them to C++ over the WebBrowserComponent bridge (C++ calls FlowLoader/loadFlow).
 *
 * The web AudioGraphManager rebuilds the whole engine on any edge change
 * (Flow.tsx `init()` re-creates it), so re-sending the full flow on initialize()
 * mirrors the web behaviour exactly; deletes just re-sync. Live param/note changes
 * forward as bridge events.
 */
export class NativeFlowEngine implements IFlowEngine {
  // Re-push the flow when a worklet is (re)compiled in the webview, so C++ hot-reloads
  // the new wasm. The compiled bytes live in node.data.wasmBase64 (set by the worklet
  // node UI), which serializeFlow already includes.
  private readonly onWorkletCompiled = () => this.syncFlow();

  constructor(
    _audioContext: AudioContext,
    private readonly nodesRef: RefObject<any[]>,
    private readonly edgesRef: RefObject<any[]>,
  ) {
    EventBus.getInstance().subscribe('worklet.compiled', this.onWorkletCompiled);
  }

  private syncFlow(): void {
    emit('loadFlow', { flow: serializeFlow(this.nodesRef.current, this.edgesRef.current) });
  }

  initialize(): void { this.syncFlow(); }
  resync(): void { this.syncFlow(); }
  dispose(): void {
    EventBus.getInstance().unsubscribe('worklet.compiled', this.onWorkletCompiled);
    emit('disposeFlow', {});
  }

  setParam(nodeId: string, key: string, value: number | string): void {
    emit('setParamByName', { nodeId, key, value });
  }

  // C++ rebuilds from the re-sent flow, so deletions just re-sync the graph.
  deleteVirtualNode(_nodeId: string): void { this.syncFlow(); }
  deleteEdge(_edge: any): void { this.syncFlow(); }

  receiveNodeOn(nodeId: string, handle = 'main-input', payload: Record<string, any> = {}): void {
    emit('noteOn', { nodeId, handle, payload });
  }
  receiveNodeOff(nodeId: string, handle = 'main-input', payload: Record<string, any> = {}): void {
    emit('noteOff', { nodeId, handle, payload });
  }
}

/** Factory matching FlowEngineFactory — pass to <Flow engineFactory={createNativeEngine} />. */
export const createNativeEngine = (
  audioContext: AudioContext,
  nodesRef: RefObject<any[]>,
  edgesRef: RefObject<any[]>,
): IFlowEngine => new NativeFlowEngine(audioContext, nodesRef, edgesRef);
