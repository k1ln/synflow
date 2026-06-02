// Process-level host adapters. The host (editor, DAW, game) registers concrete
// browser/host implementations once via setHostAdapters(); core reads them through
// the getters. This keeps core free of any browser/GUI imports while still letting
// the editor wire up keyboard, Web MIDI, and storage. Headless hosts that don't
// set an adapter simply get `undefined` and the corresponding feature no-ops.

import type { ButtonInput, MidiInput, FlowLoader, AssetStore } from './env';

let _input: ButtonInput | undefined;
let _midi: MidiInput | undefined;
let _flowLoader: FlowLoader | undefined;
let _assetStore: AssetStore | undefined;

export function setHostAdapters(adapters: {
  input?: ButtonInput;
  midi?: MidiInput;
  flowLoader?: FlowLoader;
  assetStore?: AssetStore;
}): void {
  if (adapters.input !== undefined) _input = adapters.input;
  if (adapters.midi !== undefined) _midi = adapters.midi;
  if (adapters.flowLoader !== undefined) _flowLoader = adapters.flowLoader;
  if (adapters.assetStore !== undefined) _assetStore = adapters.assetStore;
}

export const getInput = (): ButtonInput | undefined => _input;
export const getMidi = (): MidiInput | undefined => _midi;
export const getFlowLoader = (): FlowLoader | undefined => _flowLoader;
export const getAssetStore = (): AssetStore | undefined => _assetStore;

/** No-op MIDI so nodes can call ensureAccess()/onMessage() unconditionally when unbound. */
const NOOP_MIDI: MidiInput = { ensureAccess: async () => { /* noop */ }, onMessage: () => () => { /* noop */ } };
export const getMidiOrNoop = (): MidiInput => _midi ?? NOOP_MIDI;
