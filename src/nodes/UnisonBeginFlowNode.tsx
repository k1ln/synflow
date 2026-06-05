import React, { useState,useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import "./AudioNode.css";



export type UnsisonBeginFlowNodeProps = {
  data: {
    label: string;
    numberOfVoices: number;
    msTimeStartDeviation: number; // random
    msTimeEndDeviation: number; // random
    detuneFreqDeviation: number; // detune in cents, scaled linearly with the incoming frequency (cents at A440)
    gainDeviation: number; // random
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

/** Parse a finite number from raw input text, falling back when the text is
 *  empty or a partial entry like "-", "." or "-." (which Number() turns into NaN). */
const toNum = (s: string, fallback = 0): number => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
};

const UnisonBeginFlowNode: React.FC<UnsisonBeginFlowNodeProps> = ({ data }) => {

  // Editable numeric fields are kept as the raw typed string so partial input
  // (a lone "-" while starting a negative value, or "1." mid-decimal) is shown
  // as-typed instead of collapsing to NaN. They're parsed to finite numbers
  // only when emitting via onChange.
  const [numberOfVoices, setNumberOfVoices] = useState<string>(String(data.numberOfVoices ?? 1));
  const [msTimeStartDeviation, setMsTimeStartDeviation] = useState<string>(String(data.msTimeStartDeviation ?? 0));
  const [msTimeEndDeviation, setMsTimeEndDeviation] = useState<string>(String(data.msTimeEndDeviation ?? 0));
  const [detuneFreqDeviation, setDetuneFreqDeviation] = useState<string>(String(data.detuneFreqDeviation ?? 0));
  const [gainDeviation, setGainDeviation] = useState<string>(String(data.gainDeviation ?? 0));
  const [label, setLabel] = useState(data.label);
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        numberOfVoices: Math.max(1, Math.round(toNum(numberOfVoices, 1))),
        msTimeStartDeviation: toNum(msTimeStartDeviation),
        msTimeEndDeviation: toNum(msTimeEndDeviation),
        detuneFreqDeviation: toNum(detuneFreqDeviation),
        gainDeviation: toNum(gainDeviation),
        label,
      });
    }
    // ...additional logic...
  }, [numberOfVoices, msTimeStartDeviation, msTimeEndDeviation, detuneFreqDeviation, gainDeviation, label]);
  
  
  return (
    <div className="flow-node" style={data.style}>
      <div className="node-title">BEGIN UNISON</div>

      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="unison-input"
        className="mainInput"
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="unison-output"
        className="mainOutput"
        style={{ top: "35%" }}
      />

      {/* Detune Output — per-voice fixed random detune (cents) */}
      <Handle
        type="source"
        position={Position.Right}
        id="detune-output"
        className="mainOutput"
        style={{ top: "65%" }}
      />
      <span
        style={{
          position: "absolute",
          right: 8,
          top: "65%",
          transform: "translateY(-50%)",
          fontSize: 8,
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        detune
      </span>

      {/* Voice spread / deviation controls */}
      <div className="node-field">
        <span className="node-label">Nr. of Voices</span>
        <input
          type="text"
          value={numberOfVoices}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setNumberOfVoices(e.target.value);
          }}
          className="node-input"
        />
        <span className="node-label">ms Start dev.</span>
        <input
          type="text"
          value={msTimeStartDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setMsTimeStartDeviation(e.target.value);
          }}
          className="node-input"
        />
        <span className="node-label">ms End dev.</span>
        <input
          type="text"
          value={msTimeEndDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setMsTimeEndDeviation(e.target.value);
          }}
          className="node-input"
        />
        <span className="node-label">Freq detune dev. (cents @ A440)</span>
        <input
          type="text"
          value={detuneFreqDeviation}
          inputMode="decimal"
          pattern="-?[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setDetuneFreqDeviation(e.target.value);
          }}
          className="node-input"
        />
        <span className="node-label">Gain dev.</span>
        <input
          type="text"
          value={gainDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setGainDeviation(e.target.value);
          }}
          className="node-input"
        />
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Unison Begin",
  style: { glowColor: "#a78bfa" },
};

export default UnisonBeginFlowNode;