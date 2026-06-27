import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Volume2 } from "lucide-react";

export type MasterOutFlowNodeProps = {
  data: {
    label: string;
    style: React.CSSProperties;
  };
};

const MasterOutFlowNode: React.FC<MasterOutFlowNodeProps> = ({ data }) => {
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
      <Volume2 size={48} color="#ffffff" strokeWidth={1.5} />

      <Handle
        type="target"
        position={Position.Left}
        id="destination-input"
        style={{ background: "#eee", top: "50%" }}
      />
    </div>
  );
};

export default MasterOutFlowNode;