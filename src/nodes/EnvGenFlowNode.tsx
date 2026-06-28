import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

const ACCENT = "#facc15"; // envelope/event yellow

export type EnvGenFlowNodeProps = {
  data: {
    label: string;
    attack: number; decay: number; sustain: number; release: number;
    amount: number; bias: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    amtMidiMapping?: MidiMapping | null;
  };
};

const EnvGenFlowNode: React.FC<EnvGenFlowNodeProps> = ({ data }) => {
  const nodeId = (data as any).id || "env";
  const flowId = (data as any).flowId || "default";

  const [attack, setAttack] = useState(data.attack ?? 0.01);
  const [decay, setDecay] = useState(data.decay ?? 0.2);
  const [sustain, setSustain] = useState(data.sustain ?? 0.5);
  const [release, setRelease] = useState(data.release ?? 0.3);
  const [amount, setAmount] = useState(data.amount ?? 1);
  const [bias, setBias] = useState(data.bias ?? 0);
  const [label, setLabel] = useState(data.label ?? "Env Gen");
  const [amtMidiMapping, setAmtMidiMapping] = useState<MidiMapping | null>(data.amtMidiMapping ?? null);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, attack, decay, sustain, release, amount, bias, label, amtMidiMapping });
    }
  }, [attack, decay, sustain, release, amount, bias, label, amtMidiMapping]);

  const trigger = useCallback(() => {
    try {
      const bus = EventBus.getInstance();
      bus.emit(`${nodeId}.main-input.receiveNodeOn`, {});
      window.setTimeout(() => bus.emit(`${nodeId}.main-input.receiveNodeOff`, {}), 500);
    } catch { /* noop */ }
  }, [nodeId]);

  const K = (label: string, value: number, set: (v: number) => void, min: number, max: number, key: string, extra?: any) => (
    <div className="node-field">
      <span className="node-label">{label}</span>
      <MidiKnob accentColor={ACCENT} min={min} max={max} value={value} onChange={(v) => set(Math.min(max, Math.max(min, v)))} midiSensitivity={0.5} label={label} persistKey={`env:${flowId}:${nodeId}:${key}`} {...(extra || {})} />
    </div>
  );

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6, gap: 4 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>ENV GEN</b>
        <button onClick={trigger} title="Trigger the envelope"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#221c00", fontWeight: 700, border: "none", background: ACCENT }}>Trig</button>
      </div>

      {/* Trigger in, envelope signal out */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        {K("A", attack, setAttack, 0, 5, "a")}
        {K("D", decay, setDecay, 0, 5, "d")}
        {K("S", sustain, setSustain, 0, 1, "s")}
        {K("R", release, setRelease, 0, 5, "r")}
      </div>
      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Amount</span>
          <MidiKnob accentColor={ACCENT} min={-8000} max={8000} value={amount} onChange={(v) => setAmount(v)}
            midiMapping={amtMidiMapping} onMidiLearnChange={setAmtMidiMapping} midiSensitivity={0.5} label="Amount" persistKey={`env:${flowId}:${nodeId}:amt`} />
          <input type="text" value={Math.round(amount * 100) / 100} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAmount(v); }} className="node-input" style={{ width: 56 }} />
        </div>
        <div className="node-field">
          <span className="node-label">Bias</span>
          <MidiKnob accentColor={ACCENT} min={-8000} max={8000} value={bias} onChange={(v) => setBias(v)} midiSensitivity={0.5} label="Bias" persistKey={`env:${flowId}:${nodeId}:bias`} />
          <input type="text" value={Math.round(bias * 100) / 100} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setBias(v); }} className="node-input" style={{ width: 56 }} />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Env Gen",
  attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.3,
  amount: 3000, bias: 0,
};

export default React.memo(EnvGenFlowNode);
