// Injected host capabilities for the headless engine. The editor and any host
// (DAW, game) provide concrete implementations; core depends only on these
// interfaces, never on the browser/GUI implementations themselves.

import type EventBus from './EventBus';
import type { SynNode, SynEdge } from './types';

/** Keyboard / button trigger source. Implemented by the app's EventManager. */
export interface ButtonInput {
  addButtonDownCallback(key: string, nodeId: string, cb: (e?: any) => void): void;
  addButtonUpCallback(key: string, nodeId: string, cb: (e?: any) => void): void;
  removeButtonDownCallback(key: string, nodeId: string): void;
  removeButtonUpCallback(key: string, nodeId: string): void;
  clearButtonCallbacks?(): void;
}

/** Web MIDI access. Implemented by the app's MidiManager. */
export interface MidiInput {
  ensureAccess(): Promise<void>;
  onMessage(cb: (m: { status: number; channel: number; data1: number; data2: number }) => void): () => void;
}

/** Resolve a sub-flow (FlowNode) by name → its graph. */
export type FlowLoader = (
  name: string,
  folderPath?: string,
) => Promise<{ nodes: SynNode[]; edges: SynEdge[] } | null>;

/** Read/write audio assets (samples, recordings). */
export interface AssetStore {
  loadAudio(name: string): Promise<ArrayBuffer | null>;
  saveAudio(
    kind: 'recording' | 'sampling',
    blob: Blob,
    filename: string,
  ): Promise<{ ok: boolean; error?: any }>;
}

/** Options passed to the engine on construction. Only `audioContext` is required. */
export interface EngineOptions {
  /** Shared per session/host. Defaults to the EventBus singleton (editor). */
  bus?: EventBus;
  /** Where this engine's master output connects. Defaults to audioContext.destination. */
  destination?: AudioNode;
  /** Keyboard/button input source (headless: omit). */
  input?: ButtonInput;
  /** Web MIDI source (headless: omit). */
  midi?: MidiInput;
  /** Sub-flow resolver (omit for self-contained/portable flows). */
  flowLoader?: FlowLoader;
  /** Audio asset store (omit if flows embed their samples). */
  assetStore?: AssetStore;
}
