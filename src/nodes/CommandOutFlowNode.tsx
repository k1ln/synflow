import React, { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";

export type CommandOutFlowNodeProps = {
  id?: string;
  data: {
    id?: string;
    commandName?: string;
    onChange?: (data: any) => void;
  };
};

/**
 * Command Out — forwards flow events/values back to the host.
 * A host listens with engine.onCommand(commandName, cb).
 */
const CommandOutFlowNode: React.FC<CommandOutFlowNodeProps> = ({ data }) => {
  const [commandName, setCommandName] = useState(data.commandName || "");

  useEffect(() => {
    data.onChange?.({ ...data, commandName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandName]);

  return (
    <div style={{ padding: 10, border: "1px solid #2a3139", borderRadius: 6, background: "#1f1f1f", color: "#eee", width: 210 }}>
      <Handle type="target" position={Position.Left} id="input" style={{ top: "50%", width: 10, height: 10 }} />
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, letterSpacing: "0.05em" }}>COMMAND OUT</div>
      <input
        className="nodrag"
        value={commandName}
        placeholder="command name"
        onChange={(e) => setCommandName(e.target.value)}
        style={{ width: "100%", background: "#111", color: "#eee", border: "1px solid #333", borderRadius: 4, padding: "4px 6px" }}
      />
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6 }}>
        host: engine.onCommand("{commandName || "name"}", cb)
      </div>
    </div>
  );
};

export default React.memo(CommandOutFlowNode);
