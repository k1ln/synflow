import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type FlowEventFreqShifterFlowNodeProps = {
  data: {
    label: string;
    shift: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    shiftMidiMapping?: MidiMapping | null;
    onChange?: (data: unknown) => void;
  };
};

/**
 * FlowEventFreqShifterFlowNode shifts frequency values
 * in flow events by a specified number of semitones.
 * 
 * This node does NOT process audio signals.
 * It transforms frequency values in flow events.
 *
 * Handles:
 * - trigger-input (left, top): Flow event input
 * - shift-input (left, bottom): Flow event to set shift
 * - flow-output (right): Flow event output with shifted freq
 */
const FlowEventFreqShifterFlowNode: React.FC<
  FlowEventFreqShifterFlowNodeProps
> = ({ data }) => {
  const [shift, setShift] = useState(data.shift ?? 0);
  const [label, setLabel] = useState(
    data.label ?? "Event Freq Shift"
  );
  const [shiftMidiMapping, setShiftMidiMapping] = useState<
    MidiMapping | null
  >(data.shiftMidiMapping ?? null);
  const nodeId = data.id ?? "eventFreqShifter";
  const flowId = data.flowId ?? "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        shift,
        label,
        shiftMidiMapping,
      });
    }
  }, [shift, label, shiftMidiMapping]);

  // Keep local state in sync with upstream data (e.g., after load or undo)
  useEffect(() => {
    if (typeof data.shift === "number" && data.shift !== shift) {
      setShift(data.shift);
    }
    if (typeof data.label === "string" && data.label !== label) {
      setLabel(data.label);
    }
    if (data.shiftMidiMapping !== undefined && data.shiftMidiMapping !== shiftMidiMapping) {
      setShiftMidiMapping(data.shiftMidiMapping ?? null);
    }
  }, [data.shift, data.label, data.shiftMidiMapping]);

  const defaultStyle: React.CSSProperties = {
    padding: "4px",
    border: "1px solid #555",
    borderRadius: "6px",
    width: "90px",
    textAlign: "center",
    background: "#1f1f1f",
    color: "#eee",
    position: "relative",
    minHeight: "140px",
  };

  const style = data.style ?? defaultStyle;

  return (
    <div style={{ ...defaultStyle, ...style }}>
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "2px",
          fontSize: "10px",
        }}
      >
        <b>⚡ EVENT SHIFT</b>
      </div>

      {/* Trigger Input Handle (top left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger-input"
        style={{
          top: 20,
          width: "10px",
          height: "10px",
          background: "#2196F3",
        }}
        title="Trigger (receives freq, emits shifted)"
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 14,
          fontSize: "7px",
          color: "#2196F3",
        }}
      >
        ▶
      </div>

      {/* Shift Value Input Handle (bottom left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="shift-input"
        style={{
          top: 60,
          width: "10px",
          height: "10px",
          background: "#FF9800",
        }}
        title="Shift Input (Flow Event)"
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 54,
          fontSize: "7px",
          color: "#FF9800",
        }}
      >
        ±
      </div>

      {/* Flow Output Handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="flow-output"
        style={{
          top: 20,
          width: "10px",
          height: "10px",
          background: "#FF9800",
        }}
        title="Flow Out (emits shifted frequency)"
      />
      <div
        style={{
          position: "absolute",
          right: 14,
          top: 14,
          fontSize: "7px",
          color: "#FF9800",
        }}
      >
        ⚡
      </div>

      {/* Shift Knob */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "15px",
          paddingBottom: "8px",
        }}
      >
        <MidiKnob
          min={-96}
          max={96}
          step={0.001}
          value={shift}
          onChange={(v) => setShift(Number(v))}
          midiMapping={shiftMidiMapping}
          onMidiLearnChange={setShiftMidiMapping}
          midiSensitivity={0.3}
          label="Shift"
          persistKey={`eventFreqShifter:${flowId}:${nodeId}:shift`}
        />
        <span
          style={{
            fontSize: "9px",
            marginTop: "2px",
          }}
        >
          Semitones
        </span>
        <input
          type="number"
          step="0.001"
          value={shift}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              setShift(Math.max(-96, Math.min(96, val)));
            }
          }}
          style={{
            width: 65,
            background: "#222",
            color: "#eee",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "1px 3px",
            fontSize: 10,
            textAlign: "center",
            marginTop: "2px",
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(FlowEventFreqShifterFlowNode);
