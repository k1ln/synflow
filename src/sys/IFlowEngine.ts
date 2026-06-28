import type { RefObject } from 'react';
import { AudioGraphManager } from './AudioGraphManager';

/**
 * The audio-engine surface the Flow editor actually uses. The web app injects the
 * default (the Web Audio `AudioGraphManager`, unchanged); the native plugin
 * injects an engine that serializes the same node/edge refs to flow JSON and
 * renders them in C++ (no Web Audio). `AudioGraphManager` satisfies this
 * structurally, so the web path is behaviourally identical.
 *
 * This is the seam for the `@synflow/ui` extraction — keep it minimal (it mirrors
 * exactly what Flow.tsx calls).
 */
export interface IFlowEngine {
  initialize(): Promise<void> | void;
  dispose(): void;
  setParam(nodeId: string, key: string, value: number | string): void;
  deleteVirtualNode(nodeId: string): void;
  deleteEdge(edge: any): void;
  // Live note triggering (the editor's keyboard / one-shot hit).
  receiveNodeOn(nodeId: string, handle?: string, payload?: Record<string, any>): void;
  receiveNodeOff(nodeId: string, handle?: string, payload?: Record<string, any>): void;
  // Optional: re-push the current graph after an in-place node-data change that
  // isn't a topology edit (e.g. compiling an AudioWorklet to wasm). The native
  // engine re-sends the flow JSON so it hot-reloads the new module; the web engine
  // omits it (it reloads the worklet through its own EventBus path).
  resync?(): void;
  // Optional Web-Audio-only param routing (Flow.tsx calls these with `?.`; the
  // native engine omits them).
  getAudioParam?(nodeId: string, key: string): any;
  connectToParam?(source: any, nodeId: string, key: string): boolean;
  listParams?(nodeId: string): Array<{ name: string; value?: number }>;
}

/** Builds the engine for an editor session. Web default below; the plugin overrides it. */
export type FlowEngineFactory = (
  audioContext: AudioContext,
  nodesRef: RefObject<any[]>,
  edgesRef: RefObject<any[]>,
) => IFlowEngine;

/** Default (web) engine: the existing Web Audio AudioGraphManager, unchanged. */
export const createDefaultEngine: FlowEngineFactory = (audioContext, nodesRef, edgesRef) =>
  new AudioGraphManager(audioContext, nodesRef, edgesRef);
