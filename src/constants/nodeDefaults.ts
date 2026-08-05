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

import * as OscillatorFlowNode from '../nodes/OscillatorFlowNode';
import * as AudioWorkletOscillatorFlowNode from '../nodes/AudioWorkletOscillatorFlowNode';
import * as GainFlowNode from '../nodes/GainFlowNode';
import * as DelayFlowNode from '../nodes/DelayFlowNode';
import * as BiquadFilterFlowNode from '../nodes/BiquadFilterFlowNode';
import * as SvfDriveFilterFlowNode from '../nodes/SvfDriveFilterFlowNode';
import * as LadderFilterFlowNode from '../nodes/LadderFilterFlowNode';
import * as KarplusFlowNode from '../nodes/KarplusFlowNode';
import * as FMFlowNode from '../nodes/FMFlowNode';
import * as WavetableFlowNode from '../nodes/WavetableFlowNode';
import * as GranularFlowNode from '../nodes/GranularFlowNode';
import * as EnvGenFlowNode from '../nodes/EnvGenFlowNode';
import * as RingModFlowNode from '../nodes/RingModFlowNode';
import * as ChorusFlowNode from '../nodes/ChorusFlowNode';
import * as DynamicCompressorFlowNode from '../nodes/DynamicCompressorFlowNode';
import * as IIRFilterFlowNode from '../nodes/IIRFilterFlowNode';
import * as DistortionFlowNode from '../nodes/DistortionFlowNode';
import * as AudioWorkletFlowNode from '../nodes/AudioWorkletFlowNode';
import * as AutomationFlowNode from '../nodes/AutomationFlowNode';
import * as ADSRFlowNode from '../nodes/ADSRFlowNode';
import * as ButtonFlowNode from '../nodes/ButtonFlowNode';
import * as MidiButtonFlowNode from '../nodes/MidiButtonFlowNode';
import * as OnOffButtonFlowNode from '../nodes/OnOffButtonFlowNode';
import * as ClockFlowNode from '../nodes/ClockFlowNode';
import * as SpeedDividerFlowNode from '../nodes/SpeedDividerFlowNode';
import * as FrequencyFlowNode from '../nodes/FrequencyFlowNode';
import * as ConstantFlowNode from '../nodes/ConstantFlowNode';
import * as SwitchFlowNode from '../nodes/SwitchFlowNode';
import * as BlockingSwitchFlowNode from '../nodes/BlockingSwitchFlowNode';
import * as FlowNode from '../nodes/FlowNode';
import * as FunctionFlowNode from '../nodes/FunctionFlowNode';
import * as ScriptSequencerFlowNode from '../nodes/ScriptSequencerFlowNode';
import * as InputNode from '../nodes/InputNode';
import * as OutputNode from '../nodes/OutputNode';
import * as SampleFlowNode from '../nodes/SampleFlowNode';
import * as MouseTriggerButton from '../nodes/MouseTriggerButton';
import * as WebRTCInputFlowNode from '../nodes/WebRTCInputFlowNode';
import * as WebRTCOutputFlowNode from '../nodes/WebRTCOutputFlowNode';
import * as AnalyzerNodeGPT from '../nodes/AnalyzerNodeGPT';
import * as OscilloscopeFlowNode from '../nodes/OscilloscopeFlowNode';
import * as MidiFileFlowNode from '../nodes/MidiFileFlowNode';
import * as UnisonBeginFlowNode from '../nodes/UnisonBeginFlowNode';
import * as UnisonEndFlowNode from '../nodes/UnisonEndFlowNode';
import * as AiVstFlowNode from '../nodes/AiVstFlowNode';

export const nodeDefaults: Record<string, Record<string, any>> = {
  OscillatorFlowNode: OscillatorFlowNode.defaultData,
  AudioWorkletOscillatorFlowNode: AudioWorkletOscillatorFlowNode.defaultData,
  GainFlowNode: GainFlowNode.defaultData,
  DelayFlowNode: DelayFlowNode.defaultData,
  BiquadFilterFlowNode: BiquadFilterFlowNode.defaultData,
  SvfDriveFilterFlowNode: SvfDriveFilterFlowNode.defaultData,
  LadderFilterFlowNode: LadderFilterFlowNode.defaultData,
  KarplusFlowNode: KarplusFlowNode.defaultData,
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
