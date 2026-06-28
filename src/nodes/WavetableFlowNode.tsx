import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

const ACCENT = "#38bdf8"; // wavetable cyan

export type WavetableFlowNodeProps = {
  data: {
    label: string;
    mode: number; // 0 = wavetable, 1 = phase distortion
    position: number;
    warp: number;
    unison: number;
    detune: number;
    attack: number; decay: number; sustain: number; release: number;
    frequency?: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    posMidiMapping?: MidiMapping | null;
    warpMidiMapping?: MidiMapping | null;
  };
};

const WavetableFlowNode: React.FC<WavetableFlowNodeProps> = ({ data }) => {
  const nodeId = (data as any).id || "wt";
  const flowId = (data as any).flowId || "default";

  const [mode, setMode] = useState<number>(data.mode ?? 0);
  const [position, setPosition] = useState(data.position ?? 0);
  const [warp, setWarp] = useState(data.warp ?? 0);
  const [unison, setUnison] = useState<number>(data.unison ?? 1);
  const [detune, setDetune] = useState(data.detune ?? 12);
  const [attack, setAttack] = useState(data.attack ?? 0.01);
  const [decay, setDecay] = useState(data.decay ?? 0.3);
  const [sustain, setSustain] = useState(data.sustain ?? 0.8);
  const [release, setRelease] = useState(data.release ?? 0.3);
  const [label, setLabel] = useState(data.label ?? "Wavetable");
  const [posMidiMapping, setPosMidiMapping] = useState<MidiMapping | null>(data.posMidiMapping ?? null);
  const [warpMidiMapping, setWarpMidiMapping] = useState<MidiMapping | null>(data.warpMidiMapping ?? null);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, mode, position, warp, unison, detune, attack, decay, sustain, release, label, posMidiMapping, warpMidiMapping });
    }
  }, [mode, position, warp, unison, detune, attack, decay, sustain, release, label, posMidiMapping, warpMidiMapping]);

  const note = useCallback(() => {
    try {
      const bus = EventBus.getInstance();
      bus.emit(`${nodeId}.main-input.receiveNodeOn`, { velocity: 1 });
      window.setTimeout(() => bus.emit(`${nodeId}.main-input.receiveNodeOff`, {}), 600);
    } catch { /* noop */ }
  }, [nodeId]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6, gap: 4 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>WAVETABLE</b>
        <select value={mode} onChange={(e) => setMode(parseInt(e.target.value, 10))} className="node-select" style={{ width: 86 }} title="Engine mode">
          <option value={0}>Wavetable</option>
          <option value={1}>Phase Dist</option>
        </select>
        <button onClick={note} title="Audition a note"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#04222e", fontWeight: 700, border: "none", background: ACCENT }}>Note</button>
      </div>

      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Position</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={position} onChange={(v) => setPosition(Math.min(1, Math.max(0, v)))}
            midiMapping={posMidiMapping} onMidiLearnChange={setPosMidiMapping} midiSensitivity={0.5} label="Position" persistKey={`wt:${flowId}:${nodeId}:pos`} />
          <Handle type="target" position={Position.Left} id="position" style={{ top: 70 }} />
        </div>
        <div className="node-field">
          <span className="node-label">Warp</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={warp} onChange={(v) => setWarp(Math.min(1, Math.max(0, v)))}
            midiMapping={warpMidiMapping} onMidiLearnChange={setWarpMidiMapping} midiSensitivity={0.5} label="Warp" persistKey={`wt:${flowId}:${nodeId}:warp`} />
          <Handle type="target" position={Position.Left} id="warp" style={{ top: 110 }} />
        </div>
      </div>

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Unison</span>
          <select value={unison} onChange={(e) => setUnison(parseInt(e.target.value, 10))} className="node-select" style={{ width: 46 }} title="Unison voices">
            {[1, 3, 5, 7].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="node-field">
          <span className="node-label">Detune</span>
          <MidiKnob accentColor={ACCENT} min={0} max={50} value={detune} onChange={(v) => setDetune(Math.max(0, v))} midiSensitivity={0.5} label="Detune" persistKey={`wt:${flowId}:${nodeId}:det`} />
        </div>
      </div>

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field"><span className="node-label">A</span>
          <MidiKnob accentColor={ACCENT} min={0} max={2} value={attack} onChange={(v) => setAttack(Math.max(0, v))} midiSensitivity={0.5} label="A" persistKey={`wt:${flowId}:${nodeId}:a`} /></div>
        <div className="node-field"><span className="node-label">D</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={decay} onChange={(v) => setDecay(Math.max(0, v))} midiSensitivity={0.5} label="D" persistKey={`wt:${flowId}:${nodeId}:d`} /></div>
        <div className="node-field"><span className="node-label">S</span>
          <MidiKnob accentColor={ACCENT} min={0} max={1} value={sustain} onChange={(v) => setSustain(Math.min(1, Math.max(0, v)))} midiSensitivity={0.5} label="S" persistKey={`wt:${flowId}:${nodeId}:s`} /></div>
        <div className="node-field"><span className="node-label">R</span>
          <MidiKnob accentColor={ACCENT} min={0} max={3} value={release} onChange={(v) => setRelease(Math.max(0, v))} midiSensitivity={0.5} label="R" persistKey={`wt:${flowId}:${nodeId}:r`} /></div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Wavetable",
  mode: 0,
  position: 0.35,
  warp: 0,
  unison: 5,
  detune: 14,
  attack: 0.01, decay: 0.4, sustain: 0.8, release: 0.4,
};

export default React.memo(WavetableFlowNode);
