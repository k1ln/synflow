import React, { useState,useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
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

const UnisonBeginFlowNode: React.FC<UnsisonBeginFlowNodeProps> = ({ data }) => {
 
  const [numberOfVoices, setNumberOfVoices] = useState<number>(data.numberOfVoices);
  const [msTimeStartDeviation, setMsTimeStartDeviation] = useState<number>(data.msTimeStartDeviation);
  const [msTimeEndDeviation, setMsTimeEndDeviation] = useState<number>(data.msTimeEndDeviation);
  const [detuneFreqDeviation, setDetuneFreqDeviation] = useState<number>(data.detuneFreqDeviation);
  const [gainDeviation, setGainDeviation] = useState<number>(data.gainDeviation);
  const [label, setLabel] = useState(data.label);
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, numberOfVoices, msTimeStartDeviation, msTimeEndDeviation, detuneFreqDeviation, gainDeviation, label });
    }
    // ...additional logic...
  }, [numberOfVoices, msTimeStartDeviation, msTimeEndDeviation, detuneFreqDeviation, gainDeviation, label]);
  
  
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>BEGIN UNISON</b></span>
      </div>

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

      {/* Gain Input with MIDI-learnable knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span><b>Nr. of Voices</b></span>
        <input
          type="text"
          value={numberOfVoices}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setNumberOfVoices(Number(e.target.value));
          }}
          className="textInput"
        />
        <span><b>ms Start dev.</b></span>
        <input
          type="text"
          value={msTimeStartDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setMsTimeStartDeviation(Number(e.target.value));
          }}
          className="textInput"
        />
        <span><b>ms End dev.</b></span>
        <input
          type="text"
          value={msTimeEndDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setMsTimeEndDeviation(Number(e.target.value));
          }}
          className="textInput"
        />
        <span><b>Freq detune dev. (cents @ A440)</b></span>
        <input
          type="text"
          value={detuneFreqDeviation}
          inputMode="decimal"
          pattern="-?[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setDetuneFreqDeviation(Number(e.target.value));
          }}
          className="textInput"
        />
        <span><b>Gain dev.</b></span>
        <input
          type="text"
          value={gainDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setGainDeviation(Number(e.target.value));
          }}
          className="textInput"
        />
      </div>
    </div>
  );
};

export default UnisonBeginFlowNode;