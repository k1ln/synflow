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
    <div className="flow-node-shell" style={{ width: 70, padding: 6 }}>
      <div className="node-title">OUT</div>

      <div className="node-col">
        <div className="node-row" style={{ gap: 4 }}>
          <button type="button" onClick={dec} className="node-btn" style={btnSize}>-</button>
          <button type="button" onClick={inc} className="node-btn" style={btnSize}>+</button>
        </div>
        <input
          type="text"
          value={index}
          readOnly
          className="nodrag node-input"
          style={{ width: 50 }}
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

const btnSize: React.CSSProperties = {
  width: 20,
  height: 20,
  padding: 0,
  fontSize: 14,
};

export default OutputNode;