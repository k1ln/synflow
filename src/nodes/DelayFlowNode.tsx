import React, { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type DelayFlowNodeProps = {
  data: {
    label: string;
    delayTime: number;
    style: React.CSSProperties;
  // MIDI mapping for delay time knob (optional)
  delayMidiMapping?: MidiMapping | null;
  // Persisted knob raw value (so we can reconstruct if mapping relative)
  knobValue?: number;
  onChange?: (data: any) => void;
  };
};

const DelayFlowNode: React.FC<DelayFlowNodeProps> = ({ data }) => {
  // Delay time stored internally in milliseconds
  const MIN_MS = 0.1;
  const MAX_MS = 20000;
  const [delayTime, setDelayTime] = useState(() => {
    const initial = data.delayTime ?? 500; // default 500ms
    return Math.min(MAX_MS, Math.max(MIN_MS, initial));
  });
  const [label, setLabel] = useState(data.label ?? "Delay");
  // Map ms -> knob (0..1) logarithmically
  const msToKnob = (ms: number) => {
    const clamped = Math.min(MAX_MS, Math.max(MIN_MS, ms));
    const logMin = Math.log10(MIN_MS);
    const logMax = Math.log10(MAX_MS);
    return (Math.log10(clamped) - logMin) / (logMax - logMin);
  };
  const knobToMs = (k: number) => {
    const logMin = Math.log10(MIN_MS);
    const logMax = Math.log10(MAX_MS);
    const logValue = logMin + k * (logMax - logMin);
    return Math.pow(10, logValue);
  };
  const [knobValue, setKnobValue] = useState<number>(() => msToKnob(data.knobValue ?? data.delayTime ?? delayTime));
  const [delayMidiMapping, setDelayMidiMapping] = useState<MidiMapping | null>(data.delayMidiMapping || null);

  // Emit changes upward (align with pattern in other nodes)
  useEffect(() => {
    if (typeof data.onChange === 'function') {
      data.onChange({
        ...data,
        label,
        delayTime,
        knobValue,
        delayMidiMapping,
      });
    }
  }, [label, delayTime, knobValue, delayMidiMapping]);

  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "50px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px", fontSize: "10px" }}>
        <span><b>DELAY</b></span>
      </div>

      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: "10px", height: "10px" }}
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Delay Time Input with MIDI-learnable knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <MidiKnob
          min={0}
          max={1}
          value={knobValue}
          onChange={(v) => {
            const k = Math.min(1, Math.max(0, v));
            setKnobValue(k);
            const ms = knobToMs(k);
            setDelayTime(ms);
          }}
          midiMapping={delayMidiMapping || undefined}
          onMidiLearnChange={setDelayMidiMapping}
          persistKey={`delay:${(data as any).flowId || 'default'}:${(data as any).id || 'node'}:time`}
          midiSensitivity={0.8}
          midiSmoothing={0.4}
        />
        <input
          type="text"
          value={Number.isFinite(delayTime) ? delayTime.toFixed(1) : ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (isNaN(v)) return;
            const clamped = Math.min(MAX_MS, Math.max(MIN_MS, v));
            setDelayTime(clamped);
            setKnobValue(msToKnob(clamped));
          }}
          style={{ 
            width: 60, 
            background: '#222', 
            color: '#eee', 
            border: '1px solid #444', 
            borderRadius: 4, 
            padding: '2px 3px', 
            fontSize: 11, 
            textAlign: 'center',
            marginBottom: '3px' 
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="delayTime"
          style={{ top: 55 }}
        />
      </div>
    </div>
  );
};

export default DelayFlowNode;