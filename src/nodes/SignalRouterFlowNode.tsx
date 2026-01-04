import React, { useState, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";

export type SignalRouterNodeProps = {
  data: {
    id: string;
    outputs: number;
    pendingRoute: number | null;
    onChange?: (data: any) => void;
  };
};

const SignalRouterFlowNode: React.FC<SignalRouterNodeProps> = ({ data }) => {
  const [outputs, setOutputs] = useState(data.outputs || 2);
  const [pendingRoute, setPendingRoute] = useState<number | null>(data.pendingRoute || null);
  const eventBus = EventBus.getInstance();

  // Listen for routing input triggers
  useEffect(() => {
    const handlers: Array<() => void> = [];

    for (let i = 0; i < outputs; i++) {
      const handler = (inputData: any) => {
        setPendingRoute(i);
      };
      eventBus.subscribe(`${data.id}.route-input-${i}.receiveNodeOn`, handler);
      handlers.push(() => eventBus.unsubscribe(`${data.id}.route-input-${i}.receiveNodeOn`, handler));
    }

    return () => {
      handlers.forEach((unsub) => unsub());
    };
  }, [outputs, data.id, eventBus]);

  // Listen for main input
  useEffect(() => {
    const handleMainInput = (inputData: any) => {
      if (pendingRoute !== null) {
        // Route to the selected output
        eventBus.emit(`${data.id}.output-${pendingRoute}.sendNodeOn`, { value: inputData.data?.value });
        setPendingRoute(null);
      }
    };
    eventBus.subscribe(`${data.id}.main-input.receiveNodeOn`, handleMainInput);
    return () => {
      eventBus.unsubscribe(`${data.id}.main-input.receiveNodeOn`, handleMainInput);
    }; 
  }, [pendingRoute, data.id, eventBus]);

  // Notify parent of changes
  useEffect(() => {
    data.onChange?.({ ...data, outputs });
  }, [outputs]);

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid #ddd",
        borderRadius: "5px",
        width: "260px",
        background: "#222",
        color: "#eee",
      }}
    >
      <div>
        <strong>Signal Router</strong>
      </div>
      <div style={{ margin: "8px 0" }}>
        <label style={{ color: "#fff" }}>Outputs:</label>
        <input
          type="number"
          min={1}
          max={8}
          value={outputs}
          onChange={e => setOutputs(Number(e.target.value))}
          style={{ width: 50, marginLeft: 8 }}
        />
      </div>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
        Trigger a routing input, then send a signal to main input.<br />
        The signal will be routed to the corresponding output.
      </div>
      {/* Main input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 40, width: 10, height: 10 }}
      />
      {/* Routing input handles */}
      {Array.from({ length: outputs }).map((_, i) => (
        <Handle
          key={`route-input-${i}`}
          type="target"
          position={Position.Left}
          id={`route-input-${i}`}
          style={{ top: 70 + i * 20, width: 10, height: 10, background: "#0af" }}
        />
      ))}
      {/* Output handles */}
      {Array.from({ length: outputs }).map((_, i) => (
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          style={{ top: 70 + i * 20, width: 10, height: 10, background: "#fa0" }}
        />
      ))}
    </div>
  );
};

export default SignalRouterFlowNode;