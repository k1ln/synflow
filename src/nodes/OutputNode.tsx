import React, { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";

export type OutputNodeProps = {
  id: string;
  data: {
    index: number;
    value: any;
    onChange?: (data:any) => void;
  };
};

const OutputNode: React.FC<OutputNodeProps> = ({ id, data }) => {
  const [index, setIndex] = React.useState<number>(
    Math.max(0, data.index ?? 0),
  );
  const externalIndexRef = useRef<number | null>(
    typeof data.index === "number" ? Math.max(0, data.index) : null,
  );

  useEffect(() => {
    const nextExternal =
      typeof data.index === "number" ? Math.max(0, data.index) : null;
    if (nextExternal !== externalIndexRef.current) {
      externalIndexRef.current = nextExternal;
      if (nextExternal !== null && nextExternal !== index) {
        setIndex(nextExternal);
      }
    }
  }, [data.index, index]);

  useEffect(() => {
    if (data.onChange) {
      data.onChange({ ...data, index });
    }
  }, [data.onChange, index]);

  
  const inc = () => setIndex(i => i + 1);
  const dec = () => setIndex(i => (i > 0 ? i - 1 : 0));
  

  return (
    <div style={containerStyle}>
      <div style={badgeStyle}>
        <span><b>OUT</b></span>
      </div>

      <div style={stackStyle}>
        <div style={buttonRowStyle}>
          <button type="button" onClick={dec} style={btnStyle}>-</button>
          <button type="button" onClick={inc} style={btnStyle}>+</button>
        </div>
        <input
          type="text"
          value={index}
          readOnly
          style={inputStyle}
        />
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: 70 }}
      />
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  padding: 6,
  border: "1px solid #555",
  borderRadius: 6,
  width: 70,
  background: "#1f1f1f",
  color: "#eee",
  textAlign: "center",
};

const badgeStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: 4,
};

const stackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
};

const btnStyle: React.CSSProperties = {
  background: "#222",
  color: "#ddd",
  border: "1px solid #555",
  width: 20,
  height: 20,
  lineHeight: "16px",
  padding: 0,
  cursor: "pointer",
  fontSize: 14,
  borderRadius: 4,
};

const inputStyle: React.CSSProperties = {
  width: 50,
  background: "#222",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "2px 4px",
  fontSize: 12,
  textAlign: "center",
};

export default OutputNode;