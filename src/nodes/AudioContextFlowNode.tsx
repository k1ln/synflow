import React from "react";
import { Handle, Position } from "@xyflow/react";

export type AudioContextFlowNodeProps = {
  data: {
    label: string;
    style: React.CSSProperties;
  };
};

const AudioContextFlowNode: React.FC<AudioContextFlowNodeProps> = ({ data }) => {
  return (
    <div
      className="flow-node"
      style={data.style}
    >
       <span><b>Audio Out</b></span>

      {/* Single Input Handle */}
      <div style={{ marginTop: "20px" }}>
        <span style={{ fontSize: "12px" }}>Destination</span>
        <Handle
          type="target"
          position={Position.Left}
          id="destination-input"
          style={{ background: "#eee" }}
        />
      </div>
    </div>
  );
};

export default AudioContextFlowNode;