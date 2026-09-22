// Public API of the sys module — see src/host/index.ts for the pattern.
// EventManager, IFlowEngine (+ createDefaultEngine) and NativeFlowEngine are
// this module's own editor-specific system wiring. EventBus and
// ArpeggiatorMode are pure pass-throughs from @synflow/core: sys is the only
// module other than host/ui allowed to import the engine package directly
// (see the '@synflow/core' policy in eslint.config.mjs, section 8), so
// anything elsewhere that needs an engine primitive gets it from here rather
// than reaching into '@synflow/core' itself.
//
// AudioGraphEventHandlers.ts/AudioGraphTypes.ts/VirtualNodeFactory.ts/
// wasmUtils.ts/AudioGraphManager.ts/EventBus.ts used to exist here too, as
// "Stage 2" auto-generated re-export shims over packages/core/src/* from an
// earlier, never-finished migration ("Removed in Stage 9" — it never was).
// Deleted: the first four were dead (nothing referenced them, even
// internally), and the last two were pure indirection over what
// '@synflow/core' already exports cleanly.
import './exposeFlowSynth';

export { EventBus, type ArpeggiatorMode } from '@synflow/core';
export { default as EventManager } from './EventManager';
export * from './IFlowEngine';
export * from './NativeFlowEngine';
