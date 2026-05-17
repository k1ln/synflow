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
    detuneCentsDeviation: number; //detune
    gainDeviation: number; // random
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

const UnisonBeginFlowNode: React.FC<UnsisonBeginFlowNodeProps> = ({ data }) => {
 
  const [numberOfVoices, setNumberOfVoices] = useState<number>(data.numberOfVoices);
  const [msTimeStartDeviation, setMsTimeStartDeviation] = useState<number>(data.msTimeStartDeviation);
  const [msTimeEndDeviation, setMsTimeEndDeviation] = useState<number>(data.msTimeEndDeviation);
  const [detuneCentsDeviation, setDetuneCentsDeviation] = useState<number>(data.detuneCentsDeviation);
  const [gainDeviation, setGainDeviation] = useState<number>(data.gainDeviation);
  const [label, setLabel] = useState(data.label);
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, numberOfVoices, msTimeStartDeviation, msTimeEndDeviation, detuneCentsDeviation, gainDeviation, label });
    }
    // ...additional logic...
  }, [numberOfVoices, msTimeStartDeviation, msTimeEndDeviation, detuneCentsDeviation, gainDeviation, label]);
  
  
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

      {/* Main Outpyut */}
      <Handle
        type="source"
        position={Position.Right}
        id="unison-output"
        className="mainOutput"
      />

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
        <span><b>Detune dev. (cents)</b></span>
        <input
          type="text"
          value={detuneCentsDeviation}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            setDetuneCentsDeviation(Number(e.target.value));
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