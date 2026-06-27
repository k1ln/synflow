import React from "react";
import { Handle, Position } from "@xyflow/react";

export type AudioContextFlowNodeProps = {
  data: {
    label: string;
    style: React.CSSProperties;
  };
};

const AudioContextFlowNode: React.FC<AudioContextFlowNodeProps> = ({ data }) => {
  if (data.style === undefined) {
    data.style = {
      padding: "10px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "200px",
      textAlign: "center",
      background: "#333",
      color: "#eee",
    }
  }
  return (
    <div
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