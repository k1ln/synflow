import MasterOutFlowNode from '../nodes/MasterOutFlowNode';
import OscillatorFlowNode from '../nodes/OscillatorFlowNode';
import AudioWorkletOscillatorFlowNode from '../nodes/AudioWorkletOscillatorFlowNode';
import FlowNode from '../nodes/FlowNode';
import BiquadFilterFlowNode from '../nodes/BiquadFilterFlowNode';
import SvfDriveFilterFlowNode from '../nodes/SvfDriveFilterFlowNode';
import LadderFilterFlowNode from '../nodes/LadderFilterFlowNode';
import KarplusFlowNode from '../nodes/KarplusFlowNode';
import FMFlowNode from '../nodes/FMFlowNode';
import WavetableFlowNode from '../nodes/WavetableFlowNode';
import GranularFlowNode from '../nodes/GranularFlowNode';
import EnvGenFlowNode from '../nodes/EnvGenFlowNode';
import RingModFlowNode from '../nodes/RingModFlowNode';
import ChorusFlowNode from '../nodes/ChorusFlowNode';
import DynamicCompressorFlowNode from '../nodes/DynamicCompressorFlowNode';
import GainFlowNode from '../nodes/GainFlowNode';
import DelayFlowNode from '../nodes/DelayFlowNode';
import ReverbFlowNode from '../nodes/ReverbFlowNode';
import DistortionFlowNode from '../nodes/DistortionFlowNode';
import AudioWorkletFlowNode from '../nodes/AudioWorkletFlowNode';
import IIRFilterFlowNode from '../nodes/IIRFilterFlowNode';
import ADSRFlowNode from '../nodes/ADSRFlowNode';
import ButtonFlowNode from '../nodes/ButtonFlowNode';
import MidiButtonFlowNode from '../nodes/MidiButtonFlowNode';
import OnOffButtonFlowNode from '../nodes/OnOffButtonFlowNode';
import ClockFlowNode from '../nodes/ClockFlowNode';
import FrequencyFlowNode from '../nodes/FrequencyFlowNode';
import ConstantFlowNode from '../nodes/ConstantFlowNode';
import SwitchFlowNode from '../nodes/SwitchFlowNode';
import BlockingSwitchFlowNode from '../nodes/BlockingSwitchFlowNode';
import FunctionFlowNode from '../nodes/FunctionFlowNode';
import InputNode from '../nodes/InputNode';
import OutputNode from '../nodes/OutputNode';
import SampleFlowNode from '../nodes/SampleFlowNode';
import MidiFlowNote from '../nodes/MidiFlowNote';
import SequencerFlowNode from '../nodes/SequencerFlowNode';
import SequencerFrequencyFlowNode from '../nodes/SequencerFrequencyFlowNode';
import ScriptSequencerFlowNode from '../nodes/ScriptSequencerFlowNode';
import AutomationFlowNode from '../nodes/AutomationFlowNode';
import ArpeggiatorFlowNode from '../nodes/ArpeggiatorFlowNode';
import AnalyzerNodeGPT from '../nodes/AnalyzerNodeGPT';
import OscilloscopeFlowNode from '../nodes/OscilloscopeFlowNode';
import LogFlowNode from '../nodes/LogFlowNode';
import MidiKnobFlowNode from '../nodes/MidiKnobFlowNode';
import EventFlowNode from '../nodes/EventFlowNode';
import MouseTriggerButton from '../nodes/MouseTriggerButton';
import NoiseFlowNode from '../nodes/NoiseFlowNode';
import MicFlowNode from '../nodes/MicFlowNode';
import RecordingFlowNode from '../nodes/RecordingFlowNode';
import SpeedDividerFlowNode from '../nodes/SpeedDividerFlowNode';
import AudioSignalFreqShifterFlowNode from '../nodes/AudioSignalFreqShifterFlowNode';
import FlowEventFreqShifterFlowNode from '../nodes/FlowEventFreqShifterFlowNode';
import EqualizerFlowNode from '../nodes/EqualizerFlowNode';
import VocoderFlowNode from '../nodes/VocoderFlowNode';
import MidiFileFlowNode from '../nodes/MidiFileFlowNode';
import OrchestratorFlowNode from '../nodes/OrchestratorFlowNode';
import UnisonBeginFlowNode from '../nodes/UnisonBeginFlowNode';
import UnisonEndFlowNode from '../nodes/UnisonEndFlowNode';
import CommandInFlowNode from '../nodes/CommandInFlowNode';
import CommandOutFlowNode from '../nodes/CommandOutFlowNode';

export const nodeTypes = {
  MasterOutFlowNode,
  OscillatorFlowNode,
  AudioWorkletOscillatorFlowNode,
  FlowNode,
  BiquadFilterFlowNode,
  SvfDriveFilterFlowNode,
  LadderFilterFlowNode,
  KarplusFlowNode,
  FMFlowNode,
  WavetableFlowNode,
  GranularFlowNode,
  EnvGenFlowNode,
  RingModFlowNode,
  ChorusFlowNode,
  DynamicCompressorFlowNode,
  GainFlowNode,
  DelayFlowNode,
  ReverbFlowNode,
  DistortionFlowNode,
  AudioWorkletFlowNode,
  IIRFilterFlowNode,
  ADSRFlowNode,
  ButtonFlowNode,
  MidiButtonFlowNode,
  OnOffButtonFlowNode,
  ClockFlowNode,
  FrequencyFlowNode,
  ConstantFlowNode,
  SwitchFlowNode,
  BlockingSwitchFlowNode,
  FunctionFlowNode,
  InputNode,
  OutputNode,
  SampleFlowNode,
  MidiFlowNote,
  SequencerFlowNode,
  SequencerFrequencyFlowNode,
  ScriptSequencerFlowNode,
  AutomationFlowNode,
  ArpeggiatorFlowNode,
  AnalyzerNodeGPT,
  OscilloscopeFlowNode,
  LogFlowNode,
  MidiKnobFlowNode,
  EventFlowNode,
  MouseTriggerButton,
  NoiseFlowNode,
  MicFlowNode,
  RecordingFlowNode,
  SpeedDividerFlowNode,
  AudioSignalFreqShifterFlowNode,
  FlowEventFreqShifterFlowNode,
  EqualizerFlowNode,
  VocoderFlowNode,
  MidiFileFlowNode,
  OrchestratorFlowNode,
  UnisonBeginFlowNode,
  UnisonEndFlowNode,
  CommandInFlowNode,
  CommandOutFlowNode,
};

export const orderedNodeTypes = Object.fromEntries(
  Object.entries(nodeTypes).sort(([a], [b]) => a.localeCompare(b))
);
