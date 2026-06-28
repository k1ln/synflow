import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import "./AudioNode.css";

export type RingModFlowNodeProps = {
  data: {
    label: string;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
  };
};

/**
 * RingModFlowNode — multiplies two audio inputs (a * b).
 * Handles: a (top-left), b (bottom-left), output (right).
 */
const RingModFlowNode: React.FC<RingModFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label ?? "Ring Mod");

  useEffect(() => {
    if (data.onChange instanceof Function) data.onChange({ ...data, label });
  }, [label]);

  const defaultStyle: React.CSSProperties = {
    padding: "4px",
    border: "1px solid #555",
    borderRadius: "6px",
    width: "90px",
    minHeight: "90px",
    textAlign: "center",
    background: "#1f1f1f",
    color: "#eee",
    position: "relative",
  };
  const style = data.style ?? defaultStyle;

  return (
    <div style={{ ...defaultStyle, ...style }}>
      <div className="node-title">✕ Ring Mod</div>

      {/* Input A (carrier) */}
      <Handle type="target" position={Position.Left} id="a" style={{ top: 24, width: "10px", height: "10px", background: "#4CAF50" }} title="A (carrier)" />
      <div style={{ position: "absolute", left: 14, top: 18, fontSize: "8px", color: "#4CAF50" }}>A</div>

      {/* Input B (modulator) */}
      <Handle type="target" position={Position.Left} id="b" style={{ top: 56, width: "10px", height: "10px", background: "#FF9800" }} title="B (modulator)" />
      <div style={{ position: "absolute", left: 14, top: 50, fontSize: "8px", color: "#FF9800" }}>B</div>

      {/* Output */}
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" style={{ top: 24, width: "10px", height: "10px", background: "#4CAF50" }} title="A × B" />

      <div style={{ marginTop: 28, fontSize: "20px", opacity: 0.8 }}>A&nbsp;✕&nbsp;B</div>
    </div>
  );
};

export const defaultData = {
  label: "Ring Mod",
};

export default React.memo(RingModFlowNode);
