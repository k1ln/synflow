import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

export type ButtonNodeProps = {
  assignedKey: string | null;
  data: {
    assignedKey: string | null;
    label: string;
    style: React.CSSProperties;
    ispressed: boolean;
    id: string;
    onChange: (data: any) => void;
    dispatchEvent: (event: string) => void;
  };
};

const ButtonFlowNode: React.FC<ButtonNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label || "Button");
  const [assignedKey, setAssignedKey] = useState<string | null>(data.assignedKey);
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  const [oldKey, setOldKey] = useState<string | null>();
  const eventBus = EventBus.getInstance();

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, assignedKey, label, style });
    }
  }, [assignedKey, label, style]);

  // Handle key assignment
  const handleKeyPress = (e: React.KeyboardEvent) => {
    setOldKey(assignedKey);
    setAssignedKey(e.key.toUpperCase());
  };

  const changeBackgroundColorCallback = React.useCallback((data: any) => {
    setStyle((prevStyle) => ({ ...prevStyle, background: data.color }));
  }, [setStyle]);

  useEffect(() => {
    eventBus.subscribe(data.id + ".style.background", changeBackgroundColorCallback);
    return () => {
      eventBus.unsubscribe(data.id + ".style.background", changeBackgroundColorCallback);
    };
  });

  if (data.style === undefined) {
    data.style = {
      padding: "10px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "120px",
      textAlign: "center",
      background: "#333",
      color: "#eee",
    };
  }
  data.style = { ...data.style, width: "60px", height: "60px" };
  return (
    <div style={data.style}>
      <Handle
        type="source"
        position={Position.Right}
        id="output"
      />

      {/* Key Assignment */}
      <div>
        <button
          className="nodrag nowheel nopan"
          draggable={false}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onKeyDown={handleKeyPress}
          style={{
            padding: "10px",
            margin: "10px 0",
            background: "#444",
            color: "#fff",
            border: "1px solid #ddd",
            borderRadius: "5px",
            cursor: "pointer",
            width: 'auto',
            maxWidth: '100%'
          }}
        >
          {assignedKey || "press a key"}
        </button>
      </div>
    </div>
  );
};

export default ButtonFlowNode;