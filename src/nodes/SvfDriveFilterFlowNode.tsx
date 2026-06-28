import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type SvfDriveFilterFlowNodeProps = {
  data: {
    label: string;
    cutoff: number;
    resonance: number;
    drive: number;
    mix: number;
    mode: number; // 0=LP 1=HP 2=BP 3=Notch
    slope: number; // 1 => 12 dB, 2 => 24 dB
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    cutoffMidiMapping?: MidiMapping | null;
    resoMidiMapping?: MidiMapping | null;
    driveMidiMapping?: MidiMapping | null;
    mixMidiMapping?: MidiMapping | null;
  };
};

const MODES = ["LP", "HP", "BP", "Notch"];

const SvfDriveFilterFlowNode: React.FC<SvfDriveFilterFlowNodeProps> = ({ data }) => {
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

  const [cutoff, setCutoff] = useState(data.cutoff ?? 1000);
  const [cutoffNorm, setCutoffNorm] = useState(normFromFreq(data.cutoff ?? 1000));
  const [resonance, setResonance] = useState(data.resonance ?? 0.2);
  const [drive, setDrive] = useState(data.drive ?? 1);
  const [mix, setMix] = useState(data.mix ?? 1);
  const [mode, setMode] = useState<number>(data.mode ?? 0);
  const [slope, setSlope] = useState<number>(data.slope ?? 1);
  const [label, setLabel] = useState(data.label ?? "SVF Drive");
  const [cutoffMidiMapping, setCutoffMidiMapping] = useState<MidiMapping | null>(data.cutoffMidiMapping ?? null);
  const [resoMidiMapping, setResoMidiMapping] = useState<MidiMapping | null>(data.resoMidiMapping ?? null);
  const [driveMidiMapping, setDriveMidiMapping] = useState<MidiMapping | null>(data.driveMidiMapping ?? null);
  const [mixMidiMapping, setMixMidiMapping] = useState<MidiMapping | null>(data.mixMidiMapping ?? null);

  const nodeId = (data as any).id || "svf";
  const flowId = (data as any).flowId || "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        cutoff,
        resonance,
        drive,
        mix,
        mode,
        slope,
        label,
        cutoffMidiMapping,
        resoMidiMapping,
        driveMidiMapping,
        mixMidiMapping,
      });
    }
  }, [cutoff, resonance, drive, mix, mode, slope, label, cutoffMidiMapping, resoMidiMapping, driveMidiMapping, mixMidiMapping]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>SVF DRIVE</b>
        <div style={{ display: "flex", gap: 4 }}>
          <select
            value={mode}
            onChange={(e) => setMode(parseInt(e.target.value, 10))}
            className="node-select"
            style={{ width: 56 }}
            title="Filter mode"
          >
            {MODES.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={slope}
            onChange={(e) => setSlope(parseInt(e.target.value, 10))}
            className="node-select"
            style={{ width: 56 }}
            title="Slope"
          >
            <option value={1}>12 dB</option>
            <option value={2}>24 dB</option>
          </select>
        </div>
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
            accentColor="#f59e0b"
            min={0}
            max={1}
            value={cutoffNorm}
            onChange={(n) => { setCutoffNorm(n); setCutoff(freqFromNorm(n)); }}
            midiMapping={cutoffMidiMapping}
            onMidiLearnChange={setCutoffMidiMapping}
            midiSensitivity={0.5}
            midiSmoothing={0.7}
            label="Cutoff"
            persistKey={`svf:${flowId}:${nodeId}:cutoffLog`}
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
            accentColor="#f59e0b"
            min={0}
            max={0.99}
            value={resonance}
            onChange={(v) => setResonance(Math.min(0.99, Math.max(0, v)))}
            midiMapping={resoMidiMapping}
            onMidiLearnChange={setResoMidiMapping}
            midiSensitivity={0.5}
            label="Reso"
            persistKey={`svf:${flowId}:${nodeId}:reso`}
          />
          <input
            type="text"
            value={Math.round(resonance * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setResonance(Math.min(0.99, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
          <Handle type="target" position={Position.Left} id="resonance" style={{ top: 110 }} />
        </div>
      </div>

      {/* Drive + Mix */}
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Drive</span>
          <MidiKnob
            accentColor="#f59e0b"
            min={1}
            max={20}
            value={drive}
            onChange={(v) => setDrive(Math.min(20, Math.max(1, v)))}
            midiMapping={driveMidiMapping}
            onMidiLearnChange={setDriveMidiMapping}
            midiSensitivity={0.5}
            label="Drive"
            persistKey={`svf:${flowId}:${nodeId}:drive`}
          />
          <input
            type="text"
            value={Math.round(drive * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDrive(Math.min(20, Math.max(1, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Mix</span>
          <MidiKnob
            accentColor="#f59e0b"
            min={0}
            max={1}
            value={mix}
            onChange={(v) => setMix(Math.min(1, Math.max(0, v)))}
            midiMapping={mixMidiMapping}
            onMidiLearnChange={setMixMidiMapping}
            midiSensitivity={0.5}
            label="Mix"
            persistKey={`svf:${flowId}:${nodeId}:mix`}
          />
          <input
            type="text"
            value={Math.round(mix * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setMix(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "SVF Drive",
  cutoff: 1000,
  resonance: 0.2,
  drive: 1,
  mix: 1,
  mode: 0,
  slope: 1,
};

export default React.memo(SvfDriveFilterFlowNode);
