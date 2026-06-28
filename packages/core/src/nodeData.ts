// Core-owned node data shapes. Replaces the engine's former type imports from
// the GUI `src/nodes/*FlowNode.tsx` files, so core depends on nothing.
//
// The `*Props` aliases are intentionally permissive: the engine only reads
// `node.data.*` loosely. The domain types below carry real structure because
// the engine accesses their fields. The GUI keeps its own richer `*Props`
// definitions; these are structurally compatible.

/** Generic flow-node prop shape the engine casts to for `.data` access. */
export type NodeProps<D = any> = { id?: string; type?: string; data: D; [key: string]: any };

// ── Permissive per-node prop aliases (engine reads .data loosely) ─────────────
export type ADSRFlowNodeProps = NodeProps;
export type AudioSignalFreqShifterFlowNodeProps = NodeProps;
export type AudioWorkletFlowNodeProps = NodeProps;
export type BiquadFilterFlowNodeProps = NodeProps;
export type ButtonNodeProps = NodeProps;
export type ClockNodeProps = NodeProps;
export type ConstantNodeProps = NodeProps;
export type DelayFlowNodeProps = NodeProps;
export type DistortionFlowNodeProps = NodeProps;
export type DynamicCompressorFlowNodeProps = NodeProps;
export type EqualizerFlowNodeProps = NodeProps;
export type FlowEventFreqShifterFlowNodeProps = NodeProps;
export type FlowNodeProps = NodeProps;
export type FrequencyFlowNodeProps = NodeProps;
export type FrequencyShifterFlowNodeProps = NodeProps;
export type FunctionNodeProps = NodeProps;
export type IIRFilterFlowNodeProps = NodeProps;
export type InputNodeProps = NodeProps;
export type MidiButtonNodeProps = NodeProps;
export type MidiFileFlowNodeProps = NodeProps;
export type OnOffButtonFlowNodeProps = NodeProps;
export type OscillatorFlowNodeProps = NodeProps;
export type OutputNodeProps = NodeProps;
export type ReverbFlowNodeProps = NodeProps;
export type SampleFlowNodeProps = NodeProps;
export type SwitchFlowNodeProps = NodeProps;
export type UnisonEndFlowNodeProps = NodeProps;
// (historical typo preserved to match existing import sites)
export type UnsisonBeginFlowNodeProps = NodeProps;
export type VocoderFlowNodeProps = NodeProps;

// ── Domain types with real structure (engine reads their fields) ──────────────
export type AudioBufferSegment = {
  id: string;
  label: string;
  start: number; // seconds
  end: number;   // seconds
  loopEnabled?: boolean;
  loopMode?: 'hold' | 'toggle';
  holdEnabled?: boolean;
  reverse?: boolean;
  speed?: number;
  detectedFrequency?: number | null;
  grainEnabled?: boolean;
  grainSize?: number;
  grainOverlap?: number;
  [key: string]: any;
};

export interface MidiNote {
  note: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
  channel: number;
}

export interface MidiTempoChange {
  tick: number;
  bpm: number;
}

export interface ParsedMidiFile {
  name: string;
  ticksPerBeat: number;
  tracks: { notes: MidiNote[];[key: string]: any }[];
  totalTicks: number;
  totalBars: number;
  tempoChanges: MidiTempoChange[];
}

export type NoiseKind =
  | 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'gray'
  | 'velvet' | 'green' | 'infrared' | 'binary' | 'crackle';

export interface NoiseFlowNodeData {
  id?: string;
  label: string;
  noiseType?: NoiseKind;
  style?: any;
  processorCode?: string;
  params?: any[];
}

export interface MidiButtonMapping {
  type: 'note' | 'cc' | 'aftertouch';
  channel: number;
  number: number;
}
