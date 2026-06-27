import React, { useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import "./AudioNode.css";
import { ConvolverData, ConvolverDataSchema, defaultConvolverData } from "../types/ConvolverData.schema";

export type ConvolverFlowNodeProps = {
  data: ConvolverData;
};

const ConvolverFlowNode: React.FC<ConvolverFlowNodeProps> = ({ data }) => {
  // build a safe data object using schema defaults (without mutating props)
  const safeData = useMemo<ConvolverData>(() => ({ ...defaultConvolverData, ...data }), [data]);
  const [label, setLabel] = useState(safeData.label);
  const [normalize, setNormalize] = useState(safeData.normalize);
  const [impulseResponseUrl, setImpulseResponseUrl] = useState(safeData.impulseResponseUrl);

  const loadImpulseResponse = async () => {
    try {
      const audioContext = new AudioContext();
      const response = await fetch(impulseResponseUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Impulse Response Loaded
      // You can now use `audioBuffer` with a ConvolverNode
    } catch (error) {
      console.error("Error loading impulse response:", error);
    }
  };
  const style = useMemo(() => safeData.style ?? defaultConvolverData.style, [safeData.style]);
  return (
    <div
      style={style}
    >
      <div className="audio-header">
        <label>
          <b>Convolver:</b>
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

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Normalize Toggle */}
      <div>
        <label>Normalize</label>
        <input
          type="checkbox"
          checked={normalize}
          onChange={(e) => setNormalize(e.target.checked)}
          className="audio-checkbox"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="normalize"
          style={{ top: 65 }}
        />
      </div>

      {/* Impulse Response URL Input */}
      <div>
        <label>Impulse Response URL</label>
        <input
          type="text"
          value={impulseResponseUrl}
          onChange={(e) => setImpulseResponseUrl(e.target.value)}
          className="audio-input"
          placeholder="Enter .wav file URL"
        />
      </div>

      {/* Load Button */}
      <div>
        <button
          onClick={loadImpulseResponse}
          style={{
            marginTop: "10px",
            padding: "5px 10px",
            background: "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Load Impulse Response
        </button>
      </div>
    </div>
  );
};

export default ConvolverFlowNode;