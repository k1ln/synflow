import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
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
  
  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "130px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  
  return (
    <div
      style={data.style}
    >
      <div style={{ textAlign: "center", marginBottom: "0px", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "2px 4px" }}>
        <span><b>FILTER</b></span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as BiquadFilterType)}
          style={{ 
            width: 72, 
            background: '#222', 
            color: '#eee', 
            border: '1px solid #444', 
            borderRadius: 4, 
            padding: '1px 2px',
            marginLeft: 6, 
            fontSize: 9, 
            textAlign: 'center' }}
        >
          {[
            "lowpass",
            "highpass",
            "bandpass",
            "lowshelf",
            "highshelf",
            "peaking",
            "notch",
            "allpass",
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
        {/* Frequency Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Freq.</span>
          <MidiKnob
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
          <input
            type="text"
            value={Math.round(frequency * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, val));
                setFrequency(clamped);
                setFreqKnobNorm(normFromFreq(clamped));
              }
            }}
            className=""
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="frequency"
            style={{ top: 55 }}
          />
        </div>

        {/* Detune Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Detune</span>
          <MidiKnob
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
          <input
            type="text"
            value={detune}
            onChange={(e) => setDetune(parseFloat(e.target.value))}
            className=""
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
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
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
        {/* Q Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Q</span>
          <MidiKnob
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
          <input
            type="text"
            value={Q}
            onChange={(e) => setQ(parseFloat(e.target.value))}
            className=""
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="Q"
            style={{ top: 135 }}
          />
        </div>

        {/* Gain Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Gain</span>
          <MidiKnob
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
          <input
            type="text"
            value={gain}
            onChange={(e) => setGain(parseFloat(e.target.value))}
            className=""
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
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

export default React.memo(BiquadFilterFlowNode);