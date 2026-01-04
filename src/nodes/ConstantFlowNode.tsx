import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";

export type ConstantNodeProps = {
  data: {
    value: string;
    id:string;
    onChange: (data: any) => void;
  };
};

const ConstantFlowNode: React.FC<ConstantNodeProps> = ({ data }) => {
  const [value, setValue] = useState(data.value || "Default");

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, value });
    }
  }, [value]);
  return (
    <div
      style={{
        padding: 4,
        border: "1px solid #555",
        borderRadius: 6,
        width: 72,
        textAlign: "center",
        background: "#333",
        color: "#eee",
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: "50%", width: "10px", height: "10px" }}
      />

      {/* Node Content */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            const num = parseFloat(value);
            if (!Number.isFinite(num)) return;
            let delta = 0;
            if (e.ctrlKey) {
              if (e.key === "ArrowUp") delta = 100;
              if (e.key === "ArrowDown") delta = -100;
              if (e.key === "ArrowRight") delta = 1000;
              if (e.key === "ArrowLeft") delta = -1000;
            } else {
              if (e.key === "ArrowUp") delta = 1;
              if (e.key === "ArrowDown") delta = -1;
              if (e.key === "ArrowRight") delta = 10;
              if (e.key === "ArrowLeft") delta = -10;
            }
            if (delta !== 0) {
              e.preventDefault();
              setValue(String(num + delta));
            }
          }}
          style={{
            width: 50,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '1px 3px',
            fontSize: 10,
            textAlign: 'center',
          }}
        />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: "50%", width: "10px", height: "10px" }}
      />
    </div>
  );
};

export default React.memo(ConstantFlowNode);