import React from "react";
import { Handle, Position } from "@xyflow/react";
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
    <div className="flow-node" style={data.style}>
      <div className="node-title">UNISON END</div>

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

export const defaultData = {
  label: "Unison End",
  amount: 4,
  detuneSpread: 20,
  volumeSpread: 15,
  avgDelayMs: 10,
  maxDelayMs: 50,
  style: { glowColor: "#a78bfa" },
};

export default UnisonEndFlowNode;