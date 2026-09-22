// Public API of the sys module — see src/host/index.ts for the pattern.
// AudioGraphEventHandlers/AudioGraphManager/AudioGraphTypes/VirtualNodeFactory/
// wasmUtils aren't consumed outside this module yet, so they stay internal.
//
// exposeFlowSynth registers window.flowSynth as a side effect — importing
// anything from this barrel runs it once, so nothing needs to import it
// separately.
import './exposeFlowSynth';

export { default as EventBus } from './EventBus';
export { default as EventManager } from './EventManager';
export * from './IFlowEngine';
export * from './NativeFlowEngine';
