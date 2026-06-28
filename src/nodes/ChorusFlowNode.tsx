import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type ChorusFlowNodeProps = {
  data: {
    label: string;
    rate: number;  // Hz
    depth: number; // ms
    mix: number;   // 0..1
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    rateMidiMapping?: MidiMapping | null;
    depthMidiMapping?: MidiMapping | null;
    mixMidiMapping?: MidiMapping | null;
  };
};

const ChorusFlowNode: React.FC<ChorusFlowNodeProps> = ({ data }) => {
  const [rate, setRate] = useState(data.rate ?? 0.8);
  const [depth, setDepth] = useState(data.depth ?? 2.5);
  const [mix, setMix] = useState(data.mix ?? 0.5);
  const [label, setLabel] = useState(data.label ?? "Chorus");
  const [rateMidiMapping, setRateMidiMapping] = useState<MidiMapping | null>(data.rateMidiMapping ?? null);
  const [depthMidiMapping, setDepthMidiMapping] = useState<MidiMapping | null>(data.depthMidiMapping ?? null);
  const [mixMidiMapping, setMixMidiMapping] = useState<MidiMapping | null>(data.mixMidiMapping ?? null);

  const nodeId = (data as any).id || "chorus";
  const flowId = (data as any).flowId || "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, rate, depth, mix, label, rateMidiMapping, depthMidiMapping, mixMidiMapping });
    }
  }, [rate, depth, mix, label, rateMidiMapping, depthMidiMapping, mixMidiMapping]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>CHORUS</b>
      </div>

      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Rate</span>
          <MidiKnob
            accentColor="#22d3ee"
            min={0.05}
            max={8}
            value={rate}
            onChange={(v) => setRate(Math.min(8, Math.max(0.05, v)))}
            midiMapping={rateMidiMapping}
            onMidiLearnChange={setRateMidiMapping}
            midiSensitivity={0.5}
            label="Rate"
            persistKey={`chorus:${flowId}:${nodeId}:rate`}
          />
          <input type="text" value={Math.round(rate * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setRate(Math.min(8, Math.max(0.05, v))); }}
            className="node-input" style={{ width: 46 }} />
        </div>

        <div className="node-field">
          <span className="node-label">Depth</span>
          <MidiKnob
            accentColor="#22d3ee"
            min={0}
            max={8}
            value={depth}
            onChange={(v) => setDepth(Math.min(8, Math.max(0, v)))}
            midiMapping={depthMidiMapping}
            onMidiLearnChange={setDepthMidiMapping}
            midiSensitivity={0.5}
            label="Depth"
            persistKey={`chorus:${flowId}:${nodeId}:depth`}
          />
          <input type="text" value={Math.round(depth * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDepth(Math.min(8, Math.max(0, v))); }}
            className="node-input" style={{ width: 46 }} />
        </div>

        <div className="node-field">
          <span className="node-label">Mix</span>
          <MidiKnob
            accentColor="#22d3ee"
            min={0}
            max={1}
            value={mix}
            onChange={(v) => setMix(Math.min(1, Math.max(0, v)))}
            midiMapping={mixMidiMapping}
            onMidiLearnChange={setMixMidiMapping}
            midiSensitivity={0.5}
            label="Mix"
            persistKey={`chorus:${flowId}:${nodeId}:mix`}
          />
          <input type="text" value={Math.round(mix * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setMix(Math.min(1, Math.max(0, v))); }}
            className="node-input" style={{ width: 46 }} />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Chorus",
  rate: 0.8,
  depth: 2.5,
  mix: 0.5,
};

export default React.memo(ChorusFlowNode);
