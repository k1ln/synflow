import React, { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";

export type CommandInFlowNodeProps = {
  id?: string;
  data: {
    id?: string;
    commandName?: string;
    kind?: "trigger" | "value" | "note";
    onChange?: (data: any) => void;
  };
};

/**
 * Command In — external control entry point. A host drives the flow with
 * engine.command(commandName, payload); this node forwards it into the graph.
 */
const CommandInFlowNode: React.FC<CommandInFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [commandName, setCommandName] = useState(data.commandName || "");
  const [kind, setKind] = useState<"trigger" | "value" | "note">(data.kind || "trigger");
  const [value, setValue] = useState(0);

  useEffect(() => {
    data.onChange?.({ ...data, commandName, kind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandName, kind]);

  const fire = (off = false) => {
    if (!commandName) return;
    const payload: any = off ? { type: "off" } : {};
    if (!off && kind === "value") payload.value = value;
    if (!off && kind === "note") { payload.note = value; payload.frequency = value; payload.velocity = 100; }
    eventBus.emit(`command.${commandName}`, payload);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#111", color: "#eee",
    border: "1px solid #333", borderRadius: 4, padding: "4px 6px", marginBottom: 6,
  };

  return (
    <div style={{ padding: 10, border: "1px solid #2a3139", borderRadius: 6, background: "#1f1f1f", color: "#eee", width: 210 }}>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, letterSpacing: "0.05em" }}>COMMAND IN</div>
      <input className="nodrag" value={commandName} placeholder="command name" onChange={(e) => setCommandName(e.target.value)} style={inputStyle} />
      <select className="nodrag" value={kind} onChange={(e) => setKind(e.target.value as any)} style={inputStyle}>
        <option value="trigger">trigger (on/off)</option>
        <option value="value">value</option>
        <option value="note">note</option>
      </select>
      {kind !== "trigger" && (
        <input className="nodrag" type="number" value={value} onChange={(e) => setValue(parseFloat(e.target.value) || 0)} style={inputStyle} />
      )}
      <button
        className="nodrag"
        onMouseDown={() => fire(false)}
        onMouseUp={() => fire(true)}
        style={{ width: "100%", padding: "5px", background: "#2a2a2a", color: "#88ffdd", border: "1px solid #444", borderRadius: 4, cursor: "pointer" }}
      >Test trigger</button>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6 }}>
        host: engine.command("{commandName || "name"}")
      </div>
      <Handle type="source" position={Position.Right} id="main-output" style={{ top: "50%", width: 10, height: 10 }} />
    </div>
  );
};

export default React.memo(CommandInFlowNode);
