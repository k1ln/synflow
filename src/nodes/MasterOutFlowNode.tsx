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
  return (
    <div
      className="flow-node"
      style={data.style}
    >
      <div className="node-title">MASTER OUT</div>
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