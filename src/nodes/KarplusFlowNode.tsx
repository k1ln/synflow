import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

export type KarplusFlowNodeProps = {
  data: {
    label: string;
    frequency: number;
    decay: number;
    tone: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    freqMidiMapping?: MidiMapping | null;
    decayMidiMapping?: MidiMapping | null;
    toneMidiMapping?: MidiMapping | null;
  };
};

const ACCENT = "#5fd08a"; // string green (source family)

const KarplusFlowNode: React.FC<KarplusFlowNodeProps> = ({ data }) => {
  const FREQ_MIN = 20;
  const FREQ_MAX = 8000;
  const normFromFreq = (f: number) => {
    const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, f));
    return Math.log(clamped / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  };
  const freqFromNorm = (n: number) => {
    const nn = Math.min(1, Math.max(0, n));
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, nn);
  };

  const [frequency, setFrequency] = useState(data.frequency ?? 220);
  const [freqNorm, setFreqNorm] = useState(normFromFreq(data.frequency ?? 220));
  const [decay, setDecay] = useState(data.decay ?? 0.6);
  const [tone, setTone] = useState(data.tone ?? 0.6);
  const [label, setLabel] = useState(data.label ?? "Karplus");
  const [freqMidiMapping, setFreqMidiMapping] = useState<MidiMapping | null>(data.freqMidiMapping ?? null);
  const [decayMidiMapping, setDecayMidiMapping] = useState<MidiMapping | null>(data.decayMidiMapping ?? null);
  const [toneMidiMapping, setToneMidiMapping] = useState<MidiMapping | null>(data.toneMidiMapping ?? null);

  const nodeId = (data as any).id || "karplus";
  const flowId = (data as any).flowId || "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, frequency, decay, tone, label, freqMidiMapping, decayMidiMapping, toneMidiMapping });
    }
  }, [frequency, decay, tone, label, freqMidiMapping, decayMidiMapping, toneMidiMapping]);

  // Audition: emit the same note-on event the engine plucks on.
  const pluck = () => {
    try { EventBus.getInstance().emit(`${nodeId}.main-input.receiveNodeOn`, { velocity: 1, frequency, value: frequency }); } catch { /* noop */ }
  };

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>KARPLUS</b>
        <button
          onClick={pluck}
          title="Audition a pluck"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#06120c", fontWeight: 700, border: "none", background: ACCENT }}
        >Pluck</button>
      </div>

      {/* Trigger / exciter input */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      {/* Main Output */}
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Pitch</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={freqNorm}
            onChange={(n) => { setFreqNorm(n); setFrequency(freqFromNorm(n)); }}
            midiMapping={freqMidiMapping}
            onMidiLearnChange={setFreqMidiMapping}
            midiSensitivity={0.5}
            midiSmoothing={0.7}
            label="Pitch"
            persistKey={`karplus:${flowId}:${nodeId}:freqLog`}
          />
          <input
            type="text"
            value={Math.round(frequency * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) { const c = Math.min(FREQ_MAX, Math.max(FREQ_MIN, val)); setFrequency(c); setFreqNorm(normFromFreq(c)); }
            }}
            className="node-input"
            style={{ width: 50 }}
          />
          <Handle type="target" position={Position.Left} id="frequency" style={{ top: 70 }} />
        </div>

        <div className="node-field">
          <span className="node-label">Decay</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={decay}
            onChange={(v) => setDecay(Math.min(1, Math.max(0, v)))}
            midiMapping={decayMidiMapping}
            onMidiLearnChange={setDecayMidiMapping}
            midiSensitivity={0.5}
            label="Decay"
            persistKey={`karplus:${flowId}:${nodeId}:decay`}
          />
          <input
            type="text"
            value={Math.round(decay * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDecay(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Tone</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={tone}
            onChange={(v) => setTone(Math.min(1, Math.max(0, v)))}
            midiMapping={toneMidiMapping}
            onMidiLearnChange={setToneMidiMapping}
            midiSensitivity={0.5}
            label="Tone"
            persistKey={`karplus:${flowId}:${nodeId}:tone`}
          />
          <input
            type="text"
            value={Math.round(tone * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTone(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Karplus",
  frequency: 220,
  decay: 0.6,
  tone: 0.6,
};

export default React.memo(KarplusFlowNode);
