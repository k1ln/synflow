import React, { useMemo, useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { useUpdateNodeInternals } from "@xyflow/react";
import EventBus from "../sys/EventBus";

export type SwitchFlowNodeProps = {
  data: {
    numOutputs: number;
    activeOutput: number;
    id: string;
    onChange: (data: any) => void;
  };
};
let irender = 0;
const SwitchFlowNode: React.FC<SwitchFlowNodeProps> = ({ data }) => {
  const [numOutputs, setNumOutputs] = useState(data.numOutputs || 2); // Default to 2 outputs
  const [numOutputsInput, setNumOutputsInput] = useState(
    String(data.numOutputs || 2)
  );
  const [activeOutput, setActiveOutput] = useState(data.activeOutput || 0);
  const [debouncedActiveOutput, setDebouncedActiveOutput] = useState(activeOutput); // Debounced state
  const eventBus = useMemo(() => EventBus.getInstance(), []);
  const updateNodeInternals = useUpdateNodeInternals();
  
  // // Update the active output when a signal is received
  // const handleSignal = () => {
  //   console.log("Signal received on node:", data.id);
  //   setActiveOutput((prev) => (prev + 1) % numOutputs); // Cycle through outputs
  // };


  // // Update node internals when numOutputs changes
  // useEffect(() => {
  //   const timeout = setTimeout(() => {
  //     updateNodeInternals(data.id);
  //   }, 100); // Throttle by 100ms

  //   return () => clearTimeout(timeout);
  // }, [numOutputs, data.id]);

  // // Subscribe to events
  // useEffect(() => {
  //   eventBus.subscribe(data.id + ".main-input.receiveNodeOn", handleSignal);
  //   return () => {
  //     eventBus.unsubscribe(data.id + ".main-input.receiveNodeOn", handleSignal);
  //   };
  // }, [data.id]);

  // // Emit active output change
  // useEffect(() => {
  //   if (data.onChange instanceof Function) {
  //     data.onChange({ ...data, activeOutput });
  //   }
  //   eventBus.emit(data.id + ".main-input.sendNodeOn", { activeOutput });
  // }, [activeOutput]);

  

  // Notify parent of changes
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, numOutputs });
    }
    setNumOutputsInput(String(numOutputs));
  }, [numOutputs]);

  // Memoized styles
  const nodeHeight = useMemo(() => Math.max(100, numOutputs * 20), [numOutputs]);
  const divStyle = useMemo(
    () => ({
      padding: "4px",
      border: "1px solid #555",
      borderRadius: "6px",
      width: "72px",
      height: `${nodeHeight}px`,
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
      position: "relative",
      fontFamily: "Arial, sans-serif",
    }),
    [nodeHeight]
  );

  const handleStyle = useMemo(
    () => ({
      width: "10px",
      height: "10px",
      background: "#fff",
    }),
    []
  );

  const outputHandlePositions = useMemo(() => {
    return Array.from({ length: numOutputs }).map((_, index) => ({
      top: `${(index + 1) * (nodeHeight / (numOutputs + 1))}px`,
    }));
  }, [numOutputs, nodeHeight]);
  return (
    <div style={divStyle}>
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>Switch</b></span>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ ...handleStyle, top: "25%" }}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="reset-input"
        style={{ ...handleStyle, top: "75%" }}
      />

      {/* Number of Outputs Input */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center" 
      }}>
        <span>No. steps</span>
        <input
          type="text"
          value={numOutputsInput}
          onChange={(e) => {
            const text = e.target.value.trim();
            setNumOutputsInput(e.target.value);
            if (text === "") {
              return;
            }
            const val = parseInt(text, 10);
            if (!isNaN(val)) {
              setNumOutputs(Math.max(1, Math.min(100, val)));
            }
          }}
          onKeyDown={(e) => {
            const num = parseInt(numOutputs.toString(), 10);
            if (!Number.isFinite(num)) return;
            let delta = 0;
            if (e.ctrlKey) {
              if (e.key === "ArrowUp") delta = 10;
              if (e.key === "ArrowDown") delta = -10;
            } else {
              if (e.key === "ArrowUp") delta = 1;
              if (e.key === "ArrowDown") delta = -1;
            }
            if (delta !== 0) {
              e.preventDefault();
              const updated = Math.max(1, Math.min(100, num + delta));
              setNumOutputs(updated);
              setNumOutputsInput(String(updated));
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
            marginBottom: '3px'
          }}
        />
      </div>

      {/* Output Handles */}
      {outputHandlePositions.map((style, index) => (
        <Handle
          key={index}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{
            ...handleStyle,
            ...style
          }}
        />
      ))}
    </div>
  );
};

export default React.memo(SwitchFlowNode);