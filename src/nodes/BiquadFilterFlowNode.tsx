import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import { OptionSelect } from "../components/OptionSelect";
import { NumberField } from "../components/NumberField";
import { BIQUAD_FILTER_OPTIONS } from "../components/nodeSymbols";
import "./AudioNode.css";

export type BiquadFilterFlowNodeProps = {
  data: {
    label: string;
    frequency: number;
    detune: number;
    Q: number;
    gain: number;
    type: BiquadFilterType;
    style: React.CSSProperties;
  id?: string;
  flowId?: string;
  onChange?: (data: any) => void;
  freqMidiMapping?: MidiMapping | null;
  detuneMidiMapping?: MidiMapping | null;
  qMidiMapping?: MidiMapping | null;
  gainMidiMapping?: MidiMapping | null;
  };
};

const BiquadFilterFlowNode: React.FC<BiquadFilterFlowNodeProps> = ({ data }) => {
  // Force defaults to 0 for detune, Q, gain if not provided
  if (data.detune == null) data.detune = 0;
  if (data.Q == null) data.Q = 0;
  if (data.gain == null) data.gain = 0;
  const [frequency, setFrequency] = useState(data.frequency);
  // Normalized knob position 0..1 for exponential mapping of frequency
  const FREQ_MIN = 20;
  const FREQ_MAX = 20000;
  const normFromFreq = (f: number) => {
    const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, f));
    return Math.log(clamped / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  };
  const freqFromNorm = (n: number) => {
    const nn = Math.min(1, Math.max(0, n));
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, nn);
  };
  const [freqKnobNorm, setFreqKnobNorm] = useState(normFromFreq(data.frequency));
  const [detune, setDetune] = useState(data.detune);
  const [Q, setQ] = useState(data.Q);
  const [gain, setGain] = useState(data.gain);
  const [label, setLabel] = useState(data.label);
  const [type, setType] = useState<BiquadFilterType>(data.type);
  const [freqMidiMapping, setFreqMidiMapping] = useState<MidiMapping | null>(null);
  const [detuneMidiMapping, setDetuneMidiMapping] = useState<MidiMapping | null>(null);
  const [qMidiMapping, setQMidiMapping] = useState<MidiMapping | null>(null);
  const [gainMidiMapping, setGainMidiMapping] = useState<MidiMapping | null>(null);
  const nodeId = (data as any).id || 'filter';
  const flowId = (data as any).flowId || 'default';

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, frequency, detune, Q, gain, label, type, freqMidiMapping, detuneMidiMapping, qMidiMapping, gainMidiMapping });
    }
  }, [frequency, detune, Q, gain, label, type, freqMidiMapping, detuneMidiMapping, qMidiMapping, gainMidiMapping]);
  
  
  return (
    <div
      className="flow-node"
      style={data.style}
    >
      <div className="node-field" style={{ marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>FILTER</b>
        <OptionSelect
          value={type}
          onChange={(v) => setType(v as BiquadFilterType)}
          options={BIQUAD_FILTER_OPTIONS}
          columns={4}
          aria-label="Filter type"
        />
      </div>
      
      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: '10px', height: '10px' }}
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Frequency and Detune side by side */}
      <div className="node-row" style={{ gap: 4 }}>
        {/* Frequency Input with MIDI-learnable knob */}
        <div className="node-field">
          <span className="node-label">Freq.</span>
          <MidiKnob
            accentColor="#60a5fa"
            min={0}
            max={1}
            value={freqKnobNorm}
            onChange={(n)=> {
              setFreqKnobNorm(n);
              const f = freqFromNorm(n);
              setFrequency(f);
            }}
            midiMapping={freqMidiMapping}
            onMidiLearnChange={setFreqMidiMapping}
            midiSensitivity={0.5}
            midiSmoothing={0.7}
            label="Freq"
            persistKey={`filter:${flowId}:${nodeId}:freqLog`}
          />
          <NumberField
            value={Math.round(frequency * 100) / 100}
            onCommit={(v) => { setFrequency(v); setFreqKnobNorm(normFromFreq(v)); }}
            min={FREQ_MIN}
            max={FREQ_MAX}
            width={50}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="frequency"
            style={{ top: 55 }}
          />
        </div>

        {/* Detune Input with MIDI-learnable knob */}
        <div className="node-field">
          <span className="node-label">Detune</span>
          <MidiKnob
            accentColor="#60a5fa"
            min={-1200}
            max={1200}
            value={detune}
            onChange={(v)=> setDetune(Math.min(1200, Math.max(-1200, v)))}
            midiMapping={detuneMidiMapping}
            onMidiLearnChange={setDetuneMidiMapping}
            midiSensitivity={0.5}
            label="Detune"
            persistKey={`filter:${flowId}:${nodeId}:detune`}
          />
          <NumberField
            value={detune}
            onCommit={setDetune}
            min={-1200}
            max={1200}
            width={50}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="detune"
            style={{ top: 95 }}
          />
        </div>
      </div>

      {/* Q and Gain side by side */}
      <div className="node-row" style={{ gap: 4 }}>
        {/* Q Input with MIDI-learnable knob */}
        <div className="node-field">
          <span className="node-label">Q</span>
          <MidiKnob
            accentColor="#60a5fa"
            min={0.0001}
            max={40}
            value={Q}
            onChange={(v)=> setQ(Math.min(40, Math.max(0.0001, v)))}
            midiMapping={qMidiMapping}
            onMidiLearnChange={setQMidiMapping}
            midiSensitivity={0.6}
            label="Q"
            persistKey={`filter:${flowId}:${nodeId}:q`}
          />
          <NumberField
            value={Q}
            onCommit={setQ}
            min={0.0001}
            max={40}
            width={50}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="Q"
            style={{ top: 135 }}
          />
        </div>

        {/* Gain Input with MIDI-learnable knob */}
        <div className="node-field">
          <span className="node-label">Gain</span>
          <MidiKnob
            accentColor="#60a5fa"
            min={-40}
            max={40}
            value={gain}
            onChange={(v)=> setGain(Math.min(40, Math.max(-40, v)))}
            midiMapping={gainMidiMapping}
            onMidiLearnChange={setGainMidiMapping}
            midiSensitivity={0.6}
            label="Gain"
            persistKey={`filter:${flowId}:${nodeId}:gain`}
          />
          <NumberField
            value={gain}
            onCommit={setGain}
            min={-40}
            max={40}
            width={50}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="gain"
            style={{ top: 175 }}
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  filterType: "lowpass",
  frequency: 1000,
  detune: 0,
  Q: 0,
  gain: 0,
};

export default React.memo(BiquadFilterFlowNode);