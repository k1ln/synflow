// Public API of the nodes module — see src/host/index.ts for the pattern.
// Every FlowNode type the registries (constants/, docs/) and the app need is
// re-exported here by name. Many files also export a same-named `defaultData`
// const, so a blanket `export *` would make it ambiguous (silently dropped by
// the ES module spec, not a compile error) — instead each file's whole
// namespace is exported too, as `XModule`, for the one real consumer
// (constants/nodeDefaults.ts) that needs `.defaultData` per node type.
//
// A handful of files in this folder are dead code (not referenced anywhere,
// even internally): AudioBufferSourceFlowNode, AudioContextFlowNode,
// ChannelMergerFlowNode, ChannelSplitterFlowNode, ConvolverFlowNode,
// FrequencyShifterFlowNode, SignalRouterFlowNode, TimelineNode,
// oscTypeSelector — left out of the public surface.

export { default as ADSRFlowNode } from './ADSRFlowNode';
export * as ADSRFlowNodeModule from './ADSRFlowNode';
export { default as AiVstFlowNode } from './AiVstFlowNode';
export * as AiVstFlowNodeModule from './AiVstFlowNode';
export { default as AnalyzerNodeGPT } from './AnalyzerNodeGPT';
export * as AnalyzerNodeGPTModule from './AnalyzerNodeGPT';
export { default as ArpeggiatorFlowNode } from './ArpeggiatorFlowNode';
export * as ArpeggiatorFlowNodeModule from './ArpeggiatorFlowNode';
export { default as AudioSignalFreqShifterFlowNode } from './AudioSignalFreqShifterFlowNode';
export * as AudioSignalFreqShifterFlowNodeModule from './AudioSignalFreqShifterFlowNode';
export { default as AudioWorkletFlowNode } from './AudioWorkletFlowNode';
export * as AudioWorkletFlowNodeModule from './AudioWorkletFlowNode';
export { default as AudioWorkletOscillatorFlowNode } from './AudioWorkletOscillatorFlowNode';
export * as AudioWorkletOscillatorFlowNodeModule from './AudioWorkletOscillatorFlowNode';
export { default as AutomationFlowNode } from './AutomationFlowNode';
export * as AutomationFlowNodeModule from './AutomationFlowNode';
export { default as BiquadFilterFlowNode } from './BiquadFilterFlowNode';
export * as BiquadFilterFlowNodeModule from './BiquadFilterFlowNode';
export { default as BlockingSwitchFlowNode } from './BlockingSwitchFlowNode';
export * as BlockingSwitchFlowNodeModule from './BlockingSwitchFlowNode';
export { default as BrassFlowNode } from './BrassFlowNode';
export * as BrassFlowNodeModule from './BrassFlowNode';
export { default as ButtonFlowNode } from './ButtonFlowNode';
export * as ButtonFlowNodeModule from './ButtonFlowNode';
export { default as ChorusFlowNode } from './ChorusFlowNode';
export * as ChorusFlowNodeModule from './ChorusFlowNode';
export { default as ClockFlowNode } from './ClockFlowNode';
export * as ClockFlowNodeModule from './ClockFlowNode';
export { default as CommandInFlowNode } from './CommandInFlowNode';
export * as CommandInFlowNodeModule from './CommandInFlowNode';
export { default as CommandOutFlowNode } from './CommandOutFlowNode';
export * as CommandOutFlowNodeModule from './CommandOutFlowNode';
export { default as ConstantFlowNode } from './ConstantFlowNode';
export * as ConstantFlowNodeModule from './ConstantFlowNode';
export { default as DelayFlowNode } from './DelayFlowNode';
export * as DelayFlowNodeModule from './DelayFlowNode';
export { default as DistortionFlowNode } from './DistortionFlowNode';
export * as DistortionFlowNodeModule from './DistortionFlowNode';
export { default as DynamicCompressorFlowNode } from './DynamicCompressorFlowNode';
export * as DynamicCompressorFlowNodeModule from './DynamicCompressorFlowNode';
export { default as EnvGenFlowNode } from './EnvGenFlowNode';
export * as EnvGenFlowNodeModule from './EnvGenFlowNode';
export { default as EqualizerFlowNode } from './EqualizerFlowNode';
export * as EqualizerFlowNodeModule from './EqualizerFlowNode';
export { default as EventFlowNode } from './EventFlowNode';
export * as EventFlowNodeModule from './EventFlowNode';
export { default as FMFlowNode } from './FMFlowNode';
export * as FMFlowNodeModule from './FMFlowNode';
export { default as FlowEventFreqShifterFlowNode } from './FlowEventFreqShifterFlowNode';
export * as FlowEventFreqShifterFlowNodeModule from './FlowEventFreqShifterFlowNode';
export { default as FlowNode } from './FlowNode';
export * as FlowNodeModule from './FlowNode';
export { default as FrequencyFlowNode } from './FrequencyFlowNode';
export * as FrequencyFlowNodeModule from './FrequencyFlowNode';
export { default as FunctionFlowNode } from './FunctionFlowNode';
export * as FunctionFlowNodeModule from './FunctionFlowNode';
export { default as GainFlowNode } from './GainFlowNode';
export * as GainFlowNodeModule from './GainFlowNode';
export { default as GranularFlowNode } from './GranularFlowNode';
export * as GranularFlowNodeModule from './GranularFlowNode';
export { default as IIRFilterFlowNode } from './IIRFilterFlowNode';
export * as IIRFilterFlowNodeModule from './IIRFilterFlowNode';
export { default as InputNode } from './InputNode';
export * as InputNodeModule from './InputNode';
export { default as KarplusFlowNode } from './KarplusFlowNode';
export * as KarplusFlowNodeModule from './KarplusFlowNode';
export { default as LadderFilterFlowNode } from './LadderFilterFlowNode';
export * as LadderFilterFlowNodeModule from './LadderFilterFlowNode';
export { default as LogFlowNode } from './LogFlowNode';
export * as LogFlowNodeModule from './LogFlowNode';
export { default as MasterOutFlowNode } from './MasterOutFlowNode';
export * as MasterOutFlowNodeModule from './MasterOutFlowNode';
export { default as MicFlowNode } from './MicFlowNode';
export * as MicFlowNodeModule from './MicFlowNode';
export { default as MidiButtonFlowNode } from './MidiButtonFlowNode';
export * as MidiButtonFlowNodeModule from './MidiButtonFlowNode';
export { default as MidiFileFlowNode } from './MidiFileFlowNode';
export * as MidiFileFlowNodeModule from './MidiFileFlowNode';
export { default as MidiFlowNote } from './MidiFlowNote';
export * as MidiFlowNoteModule from './MidiFlowNote';
export { default as MidiKnobFlowNode } from './MidiKnobFlowNode';
export * as MidiKnobFlowNodeModule from './MidiKnobFlowNode';
export { default as MouseTriggerButton } from './MouseTriggerButton';
export * as MouseTriggerButtonModule from './MouseTriggerButton';
export { default as NoiseFlowNode } from './NoiseFlowNode';
export * as NoiseFlowNodeModule from './NoiseFlowNode';
export { default as OnOffButtonFlowNode } from './OnOffButtonFlowNode';
export * as OnOffButtonFlowNodeModule from './OnOffButtonFlowNode';
export { default as OrchestratorDialog } from './OrchestratorDialog';
export * as OrchestratorDialogModule from './OrchestratorDialog';
export { default as OrchestratorFlowNode } from './OrchestratorFlowNode';
export * as OrchestratorFlowNodeModule from './OrchestratorFlowNode';
export { default as OscillatorFlowNode } from './OscillatorFlowNode';
export * as OscillatorFlowNodeModule from './OscillatorFlowNode';
export { default as OscilloscopeFlowNode } from './OscilloscopeFlowNode';
export * as OscilloscopeFlowNodeModule from './OscilloscopeFlowNode';
export { default as OutputNode } from './OutputNode';
export * as OutputNodeModule from './OutputNode';
export { default as RecordingFlowNode } from './RecordingFlowNode';
export * as RecordingFlowNodeModule from './RecordingFlowNode';
export { default as ReverbFlowNode } from './ReverbFlowNode';
export * as ReverbFlowNodeModule from './ReverbFlowNode';
export { default as RingModFlowNode } from './RingModFlowNode';
export * as RingModFlowNodeModule from './RingModFlowNode';
export { default as SampleFlowNode } from './SampleFlowNode';
export * as SampleFlowNodeModule from './SampleFlowNode';
export { default as ScriptSequencerFlowNode } from './ScriptSequencerFlowNode';
export * as ScriptSequencerFlowNodeModule from './ScriptSequencerFlowNode';
export { default as SequencerFlowNode } from './SequencerFlowNode';
export * as SequencerFlowNodeModule from './SequencerFlowNode';
export { default as SequencerFrequencyFlowNode } from './SequencerFrequencyFlowNode';
export * as SequencerFrequencyFlowNodeModule from './SequencerFrequencyFlowNode';
export { default as SpeedDividerFlowNode } from './SpeedDividerFlowNode';
export * as SpeedDividerFlowNodeModule from './SpeedDividerFlowNode';
export { default as SvfDriveFilterFlowNode } from './SvfDriveFilterFlowNode';
export * as SvfDriveFilterFlowNodeModule from './SvfDriveFilterFlowNode';
export { default as SwitchFlowNode } from './SwitchFlowNode';
export * as SwitchFlowNodeModule from './SwitchFlowNode';
export { default as UnisonBeginFlowNode } from './UnisonBeginFlowNode';
export * as UnisonBeginFlowNodeModule from './UnisonBeginFlowNode';
export { default as UnisonEndFlowNode } from './UnisonEndFlowNode';
export * as UnisonEndFlowNodeModule from './UnisonEndFlowNode';
export { default as VocoderFlowNode } from './VocoderFlowNode';
export * as VocoderFlowNodeModule from './VocoderFlowNode';
export { default as WavetableFlowNode } from './WavetableFlowNode';
export * as WavetableFlowNodeModule from './WavetableFlowNode';
export { default as WebRTCInputFlowNode } from './WebRTCInputFlowNode';
export * as WebRTCInputFlowNodeModule from './WebRTCInputFlowNode';
export { default as WebRTCOutputFlowNode } from './WebRTCOutputFlowNode';
export * as WebRTCOutputFlowNodeModule from './WebRTCOutputFlowNode';
