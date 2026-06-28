import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type LadderFilterFlowNodeProps = {
  data: {
    label: string;
    cutoff: number;
    resonance: number;
    drive: number;
    poles: number; // 2 => 12 dB, 4 => 24 dB
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    cutoffMidiMapping?: MidiMapping | null;
    resoMidiMapping?: MidiMapping | null;
    driveMidiMapping?: MidiMapping | null;
  };
};

const ACCENT = "#e0a458"; // warm "Moog" amber

const LadderFilterFlowNode: React.FC<LadderFilterFlowNodeProps> = ({ data }) => {
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

  const [cutoff, setCutoff] = useState(data.cutoff ?? 1200);
  const [cutoffNorm, setCutoffNorm] = useState(normFromFreq(data.cutoff ?? 1200));
  const [resonance, setResonance] = useState(data.resonance ?? 0.3);
  const [drive, setDrive] = useState(data.drive ?? 1);
  const [poles, setPoles] = useState<number>(data.poles ?? 4);
  const [label, setLabel] = useState(data.label ?? "Ladder");
  const [cutoffMidiMapping, setCutoffMidiMapping] = useState<MidiMapping | null>(data.cutoffMidiMapping ?? null);
  const [resoMidiMapping, setResoMidiMapping] = useState<MidiMapping | null>(data.resoMidiMapping ?? null);
  const [driveMidiMapping, setDriveMidiMapping] = useState<MidiMapping | null>(data.driveMidiMapping ?? null);

  const nodeId = (data as any).id || "ladder";
  const flowId = (data as any).flowId || "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        cutoff,
        resonance,
        drive,
        poles,
        label,
        cutoffMidiMapping,
        resoMidiMapping,
        driveMidiMapping,
      });
    }
  }, [cutoff, resonance, drive, poles, label, cutoffMidiMapping, resoMidiMapping, driveMidiMapping]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>LADDER</b>
        <select
          value={poles}
          onChange={(e) => setPoles(parseInt(e.target.value, 10))}
          className="node-select"
          style={{ width: 64 }}
          title="Slope — 2-pole (12 dB) or 4-pole Moog (24 dB)"
        >
          <option value={4}>24 dB</option>
          <option value={2}>12 dB</option>
        </select>
      </div>

      {/* Main Input */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      {/* Main Output */}
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      {/* Cutoff + Resonance */}
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Cutoff</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={cutoffNorm}
            onChange={(n) => { setCutoffNorm(n); setCutoff(freqFromNorm(n)); }}
            midiMapping={cutoffMidiMapping}
            onMidiLearnChange={setCutoffMidiMapping}
            midiSensitivity={0.5}
            midiSmoothing={0.7}
            label="Cutoff"
            persistKey={`ladder:${flowId}:${nodeId}:cutoffLog`}
          />
          <input
            type="text"
            value={Math.round(cutoff * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, val));
                setCutoff(clamped);
                setCutoffNorm(normFromFreq(clamped));
              }
            }}
            className="node-input"
            style={{ width: 50 }}
          />
          <Handle type="target" position={Position.Left} id="cutoff" style={{ top: 70 }} />
        </div>

        <div className="node-field">
          <span className="node-label">Reso</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={resonance}
            onChange={(v) => setResonance(Math.min(1, Math.max(0, v)))}
            midiMapping={resoMidiMapping}
            onMidiLearnChange={setResoMidiMapping}
            midiSensitivity={0.5}
            label="Reso"
            persistKey={`ladder:${flowId}:${nodeId}:reso`}
          />
          <input
            type="text"
            value={Math.round(resonance * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setResonance(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
          <Handle type="target" position={Position.Left} id="resonance" style={{ top: 110 }} />
        </div>
      </div>

      {/* Drive */}
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Drive</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0.1}
            max={20}
            value={drive}
            onChange={(v) => setDrive(Math.min(20, Math.max(0.1, v)))}
            midiMapping={driveMidiMapping}
            onMidiLearnChange={setDriveMidiMapping}
            midiSensitivity={0.5}
            label="Drive"
            persistKey={`ladder:${flowId}:${nodeId}:drive`}
          />
          <input
            type="text"
            value={Math.round(drive * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDrive(Math.min(20, Math.max(0.1, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Ladder",
  cutoff: 1200,
  resonance: 0.3,
  drive: 1.5,
  poles: 4,
};

export default React.memo(LadderFilterFlowNode);
