import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import "./AudioNode.css";

export type ChannelSplitterFlowNodeProps = {
  data: {
    label: string;
    numberOfOutputs: number; // Number of output channels
    style: React.CSSProperties;
  };
};

const ChannelSplitterFlowNode: React.FC<ChannelSplitterFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label);
  const [numberOfOutputs, setNumberOfOutputs] = useState(data.numberOfOutputs);

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
          <b>Channel Splitter:</b>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="audio-label-input"
        />
      </div>

      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: "10px", height: "10px" }}
      />

      {/* Number of Outputs Input */}
      <div>
        <label>Number of Outputs</label>
        <input
          type="number"
          min={1}
          max={32} // Web Audio API supports up to 32 channels
          value={numberOfOutputs}
          onChange={(e) => setNumberOfOutputs(parseInt(e.target.value))}
          className="audio-input"
        />
      </div>

      {/* Dynamic Output Handles */}
      {Array.from({ length: numberOfOutputs }, (_, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{ top: 65 + index * 30, width: "10px", height: "10px" }}
        />
      ))}
    </div>
  );
};

export default ChannelSplitterFlowNode;