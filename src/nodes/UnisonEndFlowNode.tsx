import React, { useState,useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";


export type UnisonEndFlowNodeProps = {
  data: {
    label: string;
    gain: number;
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

const UnisonEndFlowNode: React.FC<UnisonEndFlowNodeProps> = ({ data }) => {
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>  Unison End  </b></span>
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
      />  
    </div>
  );
};

export default UnisonEndFlowNode;