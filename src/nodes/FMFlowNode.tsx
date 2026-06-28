import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

const ALGO_NAMES = ["Sine", "2-op", "3-stack", "4-stack", "E.Piano", "3x2", "1→3", "6-stack FB", "Organ"];
const ACCENT = "#c084fc"; // FM purple

export type FMFlowNodeProps = {
  data: {
    label: string;
    algorithm: number;
    feedback: number;
    attack: number; decay: number; sustain: number; release: number;
    ratio0: number; ratio1: number; ratio2: number; ratio3: number; ratio4: number; ratio5: number;
    level0: number; level1: number; level2: number; level3: number; level4: number; level5: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    fbMidiMapping?: MidiMapping | null;
  };
};

const FMFlowNode: React.FC<FMFlowNodeProps> = ({ data }) => {
  const nodeId = (data as any).id || "fm";
  const flowId = (data as any).flowId || "default";

  const [algorithm, setAlgorithm] = useState<number>(data.algorithm ?? 1);
  const [feedback, setFeedback] = useState(data.feedback ?? 0);
  const [attack, setAttack] = useState(data.attack ?? 0.005);
  const [decay, setDecay] = useState(data.decay ?? 0.3);
  const [sustain, setSustain] = useState(data.sustain ?? 0.7);
  const [release, setRelease] = useState(data.release ?? 0.3);
  const [ratios, setRatios] = useState<number[]>([0, 1, 2, 3, 4, 5].map((i) => (data as any)[`ratio${i}`] ?? 1));
  const [levels, setLevels] = useState<number[]>([0, 1, 2, 3, 4, 5].map((i) => (data as any)[`level${i}`] ?? (i === 0 ? 1 : 0)));
  const [label, setLabel] = useState(data.label ?? "FM");
  const [fbMidiMapping, setFbMidiMapping] = useState<MidiMapping | null>(data.fbMidiMapping ?? null);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      const ops: Record<string, number> = {};
      for (let i = 0; i < 6; i++) { ops[`ratio${i}`] = ratios[i]; ops[`level${i}`] = levels[i]; }
      data.onChange({ ...data, algorithm, feedback, attack, decay, sustain, release, ...ops, label, fbMidiMapping });
    }
  }, [algorithm, feedback, attack, decay, sustain, release, ratios, levels, label, fbMidiMapping]);

  const setRatio = (i: number, v: number) => setRatios((r) => r.map((x, k) => (k === i ? v : x)));
  const setLevel = (i: number, v: number) => setLevels((l) => l.map((x, k) => (k === i ? v : x)));

  // Audition a note (on, then off shortly after).
  const note = useCallback(() => {
    try {
      const bus = EventBus.getInstance();
      bus.emit(`${nodeId}.main-input.receiveNodeOn`, { velocity: 1 });
      window.setTimeout(() => bus.emit(`${nodeId}.main-input.receiveNodeOff`, {}), 600);
    } catch { /* noop */ }
  }, [nodeId]);

  const numCell: React.CSSProperties = { width: 42, background: "#0a0d14", border: "1px solid #2c3a55", color: "#cdd6e6", borderRadius: 4, padding: "1px 3px", fontSize: 10 };

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6, gap: 4 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>FM 6-OP</b>
        <select value={algorithm} onChange={(e) => setAlgorithm(parseInt(e.target.value, 10))} className="node-select" style={{ width: 92 }} title="Algorithm">
          {ALGO_NAMES.map((nm, i) => <option key={nm} value={i}>{nm}</option>)}
        </select>
        <button onClick={note} title="Audition a note"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#1a0a26", fontWeight: 700, border: "none", background: ACCENT }}>Note</button>
      </div>

      {/* Trigger / pitch in, audio out */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="target" position={Position.Left} id="frequency" style={{ top: 44 }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      {/* Operator grid: ratio + level per operator */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "2px 6px", alignItems: "center", margin: "4px 2px 8px", fontSize: 10 }}>
        <span />
        <span className="node-label" style={{ textAlign: "center" }}>Ratio</span>
        <span className="node-label" style={{ textAlign: "center" }}>Level</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <span className="node-label">OP{i + 1}</span>
            <input type="number" step={0.5} min={0} value={ratios[i]} onChange={(e) => setRatio(i, Math.max(0, parseFloat(e.target.value) || 0))} style={numCell} />
            <input type="number" step={0.05} min={0} max={1} value={levels[i]} onChange={(e) => setLevel(i, Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))} style={numCell} />
          </React.Fragment>
        ))}
      </div>

      {/* Feedback + envelope */}
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">FB</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={feedback} onChange={(v) => setFeedback(Math.min(1, Math.max(0, v)))}
            midiMapping={fbMidiMapping} onMidiLearnChange={setFbMidiMapping} midiSensitivity={0.5} label="FB" persistKey={`fm:${flowId}:${nodeId}:fb`} />
        </div>
        <div className="node-field">
          <span className="node-label">A</span>
          <MidiKnob accentColor={ACCENT} min={0} max={2} value={attack} onChange={(v) => setAttack(Math.max(0, v))} midiSensitivity={0.5} label="A" persistKey={`fm:${flowId}:${nodeId}:a`} />
        </div>
        <div className="node-field">
          <span className="node-label">D</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={decay} onChange={(v) => setDecay(Math.max(0, v))} midiSensitivity={0.5} label="D" persistKey={`fm:${flowId}:${nodeId}:d`} />
        </div>
        <div className="node-field">
          <span className="node-label">S</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={sustain} onChange={(v) => setSustain(Math.min(1, Math.max(0, v)))} midiSensitivity={0.5} label="S" persistKey={`fm:${flowId}:${nodeId}:s`} />
        </div>
        <div className="node-field">
          <span className="node-label">R</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={release} onChange={(v) => setRelease(Math.max(0, v))} midiSensitivity={0.5} label="R" persistKey={`fm:${flowId}:${nodeId}:r`} />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "FM",
  algorithm: 4,
  feedback: 0.0,
  attack: 0.004, decay: 0.6, sustain: 0.4, release: 0.4,
  ratio0: 1, ratio1: 1, ratio2: 1, ratio3: 14, ratio4: 1, ratio5: 1,
  level0: 1, level1: 0.7, level2: 0.6, level3: 0.4, level4: 0, level5: 0,
};

export default React.memo(FMFlowNode);
