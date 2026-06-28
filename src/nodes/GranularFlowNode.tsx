import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

const ACCENT = "#f472b6"; // granular pink

export type GranularFlowNodeProps = {
  data: {
    label: string;
    density: number;
    size: number;
    position: number;
    spray: number;
    pitch: number;
    mix: number;
    freeze: boolean;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    posMidiMapping?: MidiMapping | null;
    pitchMidiMapping?: MidiMapping | null;
  };
};

const GranularFlowNode: React.FC<GranularFlowNodeProps> = ({ data }) => {
  const nodeId = (data as any).id || "grain";
  const flowId = (data as any).flowId || "default";

  const [density, setDensity] = useState(data.density ?? 30);
  const [size, setSize] = useState(data.size ?? 120);
  const [position, setPosition] = useState(data.position ?? 0.1);
  const [spray, setSpray] = useState(data.spray ?? 0.2);
  const [pitch, setPitch] = useState(data.pitch ?? 1);
  const [mix, setMix] = useState(data.mix ?? 1);
  const [freeze, setFreeze] = useState<boolean>(!!data.freeze);
  const [label, setLabel] = useState(data.label ?? "Granular");
  const [posMidiMapping, setPosMidiMapping] = useState<MidiMapping | null>(data.posMidiMapping ?? null);
  const [pitchMidiMapping, setPitchMidiMapping] = useState<MidiMapping | null>(data.pitchMidiMapping ?? null);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, density, size, position, spray, pitch, mix, freeze, label, posMidiMapping, pitchMidiMapping });
    }
  }, [density, size, position, spray, pitch, mix, freeze, label, posMidiMapping, pitchMidiMapping]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6, gap: 4 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>GRANULAR</b>
        <button onClick={() => setFreeze((f) => !f)} title="Freeze the grain buffer (stop recording input)"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", fontWeight: 700, border: `1px solid ${ACCENT}`, color: freeze ? "#2a0a1c" : ACCENT, background: freeze ? ACCENT : "transparent" }}>
          {freeze ? "Frozen" : "Freeze"}
        </button>
      </div>

      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field"><span className="node-label">Density</span>
          <MidiKnob accentColor={ACCENT} min={1} max={200} value={density} onChange={(v) => setDensity(Math.max(1, v))} midiSensitivity={0.5} label="Density" persistKey={`gr:${flowId}:${nodeId}:den`} /></div>
        <div className="node-field"><span className="node-label">Size</span>
          <MidiKnob accentColor={ACCENT} min={5} max={500} value={size} onChange={(v) => setSize(Math.min(500, Math.max(5, v)))} midiSensitivity={0.5} label="Size" persistKey={`gr:${flowId}:${nodeId}:size`} /></div>
        <div className="node-field"><span className="node-label">Pos</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={position} onChange={(v) => setPosition(Math.min(1, Math.max(0, v)))}
            midiMapping={posMidiMapping} onMidiLearnChange={setPosMidiMapping} midiSensitivity={0.5} label="Pos" persistKey={`gr:${flowId}:${nodeId}:pos`} />
          <Handle type="target" position={Position.Left} id="position" style={{ top: 70 }} /></div>
      </div>

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field"><span className="node-label">Spray</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={spray} onChange={(v) => setSpray(Math.min(1, Math.max(0, v)))} midiSensitivity={0.5} label="Spray" persistKey={`gr:${flowId}:${nodeId}:spray`} /></div>
        <div className="node-field"><span className="node-label">Pitch</span>
          <MidiKnob accentColor={ACCENT} min={0.25} max={4} value={pitch} onChange={(v) => setPitch(Math.min(4, Math.max(0.25, v)))}
            midiMapping={pitchMidiMapping} onMidiLearnChange={setPitchMidiMapping} midiSensitivity={0.5} label="Pitch" persistKey={`gr:${flowId}:${nodeId}:pitch`} />
          <Handle type="target" position={Position.Left} id="pitch" style={{ top: 110 }} /></div>
        <div className="node-field"><span className="node-label">Mix</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={mix} onChange={(v) => setMix(Math.min(1, Math.max(0, v)))} midiSensitivity={0.5} label="Mix" persistKey={`gr:${flowId}:${nodeId}:mix`} /></div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Granular",
  density: 40,
  size: 140,
  position: 0.15,
  spray: 0.25,
  pitch: 1,
  mix: 1,
  freeze: false,
};

export default React.memo(GranularFlowNode);
