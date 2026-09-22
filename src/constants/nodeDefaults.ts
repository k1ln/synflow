// Registry of per-node default `data`, used when a node is first created.
//
// Each node module exports its own `defaultData` right next to the component
// (e.g. OscillatorFlowNode.tsx), so a node's defaults live with the node. This
// file just collects them into one lookup keyed by node type, so Flow.tsx's
// addNode can do `{ ...base, ...nodeDefaults[type] }` instead of carrying a
// giant per-type if/else. Node types without a defaultData export simply start
// from the base `{ label: '' }`.
//
// Most nodes keep only *dynamic* style bits here (width, glow color); the shared
// base look lives in the `.flow-node` CSS class (see nodes/AudioNode.css). A few
// bespoke nodes that merge their own local style still carry the full base via
// `baseNodeStyle` from utils/styleUtils.

import { OscillatorFlowNodeModule as OscillatorFlowNode, AudioWorkletOscillatorFlowNodeModule as AudioWorkletOscillatorFlowNode, GainFlowNodeModule as GainFlowNode, DelayFlowNodeModule as DelayFlowNode, BiquadFilterFlowNodeModule as BiquadFilterFlowNode, SvfDriveFilterFlowNodeModule as SvfDriveFilterFlowNode, LadderFilterFlowNodeModule as LadderFilterFlowNode, KarplusFlowNodeModule as KarplusFlowNode, BrassFlowNodeModule as BrassFlowNode, FMFlowNodeModule as FMFlowNode, WavetableFlowNodeModule as WavetableFlowNode, GranularFlowNodeModule as GranularFlowNode, EnvGenFlowNodeModule as EnvGenFlowNode, RingModFlowNodeModule as RingModFlowNode, ChorusFlowNodeModule as ChorusFlowNode, DynamicCompressorFlowNodeModule as DynamicCompressorFlowNode, IIRFilterFlowNodeModule as IIRFilterFlowNode, DistortionFlowNodeModule as DistortionFlowNode, AudioWorkletFlowNodeModule as AudioWorkletFlowNode, AutomationFlowNodeModule as AutomationFlowNode, ADSRFlowNodeModule as ADSRFlowNode, ButtonFlowNodeModule as ButtonFlowNode, MidiButtonFlowNodeModule as MidiButtonFlowNode, OnOffButtonFlowNodeModule as OnOffButtonFlowNode, ClockFlowNodeModule as ClockFlowNode, SpeedDividerFlowNodeModule as SpeedDividerFlowNode, FrequencyFlowNodeModule as FrequencyFlowNode, ConstantFlowNodeModule as ConstantFlowNode, SwitchFlowNodeModule as SwitchFlowNode, BlockingSwitchFlowNodeModule as BlockingSwitchFlowNode, FlowNodeModule as FlowNode, FunctionFlowNodeModule as FunctionFlowNode, ScriptSequencerFlowNodeModule as ScriptSequencerFlowNode, InputNodeModule as InputNode, OutputNodeModule as OutputNode, SampleFlowNodeModule as SampleFlowNode, MouseTriggerButtonModule as MouseTriggerButton, WebRTCInputFlowNodeModule as WebRTCInputFlowNode, WebRTCOutputFlowNodeModule as WebRTCOutputFlowNode, AnalyzerNodeGPTModule as AnalyzerNodeGPT, OscilloscopeFlowNodeModule as OscilloscopeFlowNode, MidiFileFlowNodeModule as MidiFileFlowNode, UnisonBeginFlowNodeModule as UnisonBeginFlowNode, UnisonEndFlowNodeModule as UnisonEndFlowNode, AiVstFlowNodeModule as AiVstFlowNode } from '../nodes';

export const nodeDefaults: Record<string, Record<string, any>> = {
  OscillatorFlowNode: OscillatorFlowNode.defaultData,
  AudioWorkletOscillatorFlowNode: AudioWorkletOscillatorFlowNode.defaultData,
  GainFlowNode: GainFlowNode.defaultData,
  DelayFlowNode: DelayFlowNode.defaultData,
  BiquadFilterFlowNode: BiquadFilterFlowNode.defaultData,
  SvfDriveFilterFlowNode: SvfDriveFilterFlowNode.defaultData,
  LadderFilterFlowNode: LadderFilterFlowNode.defaultData,
  KarplusFlowNode: KarplusFlowNode.defaultData,
  BrassFlowNode: BrassFlowNode.defaultData,
  FMFlowNode: FMFlowNode.defaultData,
  WavetableFlowNode: WavetableFlowNode.defaultData,
  GranularFlowNode: GranularFlowNode.defaultData,
  EnvGenFlowNode: EnvGenFlowNode.defaultData,
  RingModFlowNode: RingModFlowNode.defaultData,
  ChorusFlowNode: ChorusFlowNode.defaultData,
  DynamicCompressorFlowNode: DynamicCompressorFlowNode.defaultData,
  IIRFilterFlowNode: IIRFilterFlowNode.defaultData,
  DistortionFlowNode: DistortionFlowNode.defaultData,
  AudioWorkletFlowNode: AudioWorkletFlowNode.defaultData,
  AutomationFlowNode: AutomationFlowNode.defaultData,
  ADSRFlowNode: ADSRFlowNode.defaultData,
  ButtonFlowNode: ButtonFlowNode.defaultData,
  MidiButtonFlowNode: MidiButtonFlowNode.defaultData,
  OnOffButtonFlowNode: OnOffButtonFlowNode.defaultData,
  ClockFlowNode: ClockFlowNode.defaultData,
  SpeedDividerFlowNode: SpeedDividerFlowNode.defaultData,
  FrequencyFlowNode: FrequencyFlowNode.defaultData,
  ConstantFlowNode: ConstantFlowNode.defaultData,
  SwitchFlowNode: SwitchFlowNode.defaultData,
  BlockingSwitchFlowNode: BlockingSwitchFlowNode.defaultData,
  FlowNode: FlowNode.defaultData,
  FunctionFlowNode: FunctionFlowNode.defaultData,
  ScriptSequencerFlowNode: ScriptSequencerFlowNode.defaultData,
  InputNode: InputNode.defaultData,
  OutputNode: OutputNode.defaultData,
  SampleFlowNode: SampleFlowNode.defaultData,
  MouseTriggerButton: MouseTriggerButton.defaultData,
  WebRTCInputFlowNode: WebRTCInputFlowNode.defaultData,
  WebRTCOutputFlowNode: WebRTCOutputFlowNode.defaultData,
  AnalyzerNodeGPT: AnalyzerNodeGPT.defaultData,
  OscilloscopeFlowNode: OscilloscopeFlowNode.defaultData,
  MidiFileFlowNode: MidiFileFlowNode.defaultData,
  UnisonBeginFlowNode: UnisonBeginFlowNode.defaultData,
  UnisonEndFlowNode: UnisonEndFlowNode.defaultData,
  AiVstFlowNode: AiVstFlowNode.defaultData,
};
