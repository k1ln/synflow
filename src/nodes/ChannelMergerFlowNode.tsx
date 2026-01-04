import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import "./AudioNode.css";

export type ChannelMergerFlowNodeProps = {
  data: {
    label: string;
    numberOfInputs: number; // Number of input channels
    style: React.CSSProperties;
  };
};

const ChannelMergerFlowNode: React.FC<ChannelMergerFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label);
  const [numberOfInputs, setNumberOfInputs] = useState(data.numberOfInputs);

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
      <div className="audio-header">
        <label>
          <b>Channel Merger:</b>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="audio-label-input"
        />
      </div>

      {/* Dynamic Input Handles */}
      {Array.from({ length: numberOfInputs }, (_, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          style={{ top: 20 + index * 30, width: "10px", height: "10px" }}
        />
      ))}

      {/* Number of Inputs Input */}
      <div>
        <label>Number of Inputs</label>
        <input
          type="number"
          min={1}
          max={32} // Web Audio API supports up to 32 channels
          value={numberOfInputs}
          onChange={(e) => setNumberOfInputs(parseInt(e.target.value))}
          className="audio-input"
        />
      </div>

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />
    </div>
  );
};

export default ChannelMergerFlowNode;