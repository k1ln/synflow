// @synflow/core — headless synflow audio engine. Public API.

export { default as EventBus } from './EventBus';
export type { EventCallback } from './EventBus';

export { AudioGraphManager, webAudioApiFlowNodes } from './AudioGraphManager';
export type {
  DataBaseNode,
  CustomNode,
  ExtendedOscillatorNode,
  VirtualNodeType,
} from './AudioGraphManager';

export type { SynNode, SynEdge } from './types';

export type {
  EngineOptions,
  ButtonInput,
  MidiInput,
  FlowLoader,
  AssetStore,
} from './env';

export { setHostAdapters, getInput, getMidi, getFlowLoader, getAssetStore } from './hostBindings';

export { buildPulsePeriodicWave, buildWavetablePeriodicWave } from './oscillatorWaves';
export { compileWasmModule } from './wasmUtils';

// A handful of virtual-node-specific types consumed by editor-side node UIs
// (not the engine's own wiring, which reaches virtualNodes/ internally).
// Imported directly rather than through the virtualNodes barrel: this file
// is the package's own public surface, and dts generation resolves every
// name the barrel re-exports (`export *` across all 63 files) to build the
// bundled .d.ts — so going through it here would force full type-checking
// of files nothing in the public API otherwise touches, dragging in
// unrelated pre-existing errors. See eslint.config.mjs (section 9) for the
// matching lint exception.
export type { ArpeggiatorMode } from './virtualNodes/VirtualArpeggiatorNode';
