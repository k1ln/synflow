// Public API of the components module — see src/host/index.ts for the
// pattern. CustomInstrumentUI, Knob, ObfuscatedText and legalConfig aren't
// consumed outside this module yet, so they stay internal until something
// needs them. FlowExplorer.tsx used to be here too but had zero consumers
// anywhere (not even internally) and has been deleted.
//
// MidiManager/MidiKnob/ImpressumDialog/DatenschutzDialog/MiniPlayer/
// AudioExplorer only have a default export, so they need an explicit named
// alias here; NumberField/OptionSelect/ExplorerDialog/NodePaletteDialog/
// TopBar already export a same-named const alongside their default, which
// `export *` picks up — consumers of those import the named form.
export { default as MidiManager } from './MidiManager';
export { default as MidiKnob } from './MidiKnob';
export type { MidiKnobProps, MidiMapping } from './MidiKnob';
export * from './NumberField';
export * from './OptionSelect';
export * from './nodeSymbols';
export * from './ExplorerDialog';
export * from './NodePaletteDialog';
export { default as NodePaletteDialog } from './NodePaletteDialog';
export { default as ImpressumDialog } from './ImpressumDialog';
export { default as DatenschutzDialog } from './DatenschutzDialog';
export { default as PublishDialog } from './PublishDialog';
export * from './TopBar';
export { default as MiniPlayer } from './MiniPlayer';
export { default as AudioExplorer } from './AudioExplorer';
export * from './InstrumentLiveUI';
export * from './CustomUiEditor';
