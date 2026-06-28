import React, { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";

export type InputNodeProps = {
  id: string;
  data: {
    index: number;
    value: any;
    onChange?: (data: any) => void;
  };
};

const InputNode: React.FC<InputNodeProps> = ({ id, data }) => {
  const [index, setIndex] = React.useState<number>(data.index ?? 0);
  const externalIndexRef = useRef<number | null>(
    typeof data.index === "number" ? data.index : null,
  );

  useEffect(() => {
    const nextExternal = typeof data.index === "number" ? data.index : null;
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
    <div className="flow-node-shell" style={{ width: 70, padding: 6 }}>
      <div className="node-title">IN</div>

      <div className="node-col">
        <div className="node-row" style={{ gap: 4 }}>
          <button type="button" onClick={dec} className="node-btn" style={btnSize}>-</button>
          <button type="button" onClick={inc} className="node-btn" style={btnSize}>+</button>
        </div>
        <input
          readOnly
          type="text"
          value={index}
          className="nodrag node-input"
          style={{ width: 50 }}
        />
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id={`output-${index}`}
        style={{ top: 70 }}
      />
    </div>
  );
};

const btnSize: React.CSSProperties = {
  width: 20,
  height: 20,
  padding: 0,
  fontSize: 14,
};

export const defaultData = {
  index: 0,
  value: "",
};

export default InputNode;