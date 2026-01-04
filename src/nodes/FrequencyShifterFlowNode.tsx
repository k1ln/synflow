import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type FrequencyShifterFlowNodeProps = {
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
 * FrequencyShifterFlowNode shifts audio frequencies
 * by a specified number of semitones.
 * 
 * Handles:
 * - main-input (left, top): Audio signal input
 * - shift-input (left, bottom): Flow event to set shift
 * - output (right): Audio signal output
 */
const FrequencyShifterFlowNode: React.FC<
  FrequencyShifterFlowNodeProps
> = ({ data }) => {
  const [shift, setShift] = useState(data.shift ?? 0);
  const [label, setLabel] = useState(data.label ?? "Freq Shift");
  const [shiftMidiMapping, setShiftMidiMapping] = useState<
    MidiMapping | null
  >(data.shiftMidiMapping ?? null);
  const nodeId = data.id ?? "freqShifter";
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

  const defaultStyle: React.CSSProperties = {
    padding: "4px",
    border: "1px solid #555",
    borderRadius: "6px",
    width: "90px",
    textAlign: "center",
    background: "#1f1f1f",
    color: "#eee",
    position: "relative",
    minHeight: "160px",
  };

  const style = data.style ?? defaultStyle;

  return (
    <div style={{ ...defaultStyle, ...style }}>
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "2px",
          fontSize: "11px",
        }}
      >
        <b>FREQ SHIFT</b>
      </div>

      {/* Audio Input Handle (top left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{
          top: 20,
          width: "10px",
          height: "10px",
          background: "#4CAF50",
        }}
        title="Audio In"
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 14,
          fontSize: "7px",
          color: "#4CAF50",
        }}
      >
        🔊
      </div>

      {/* Trigger Input Handle (middle left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger-input"
        style={{
          top: 60,
          width: "10px",
          height: "10px",
          background: "#2196F3",
        }}
        title="Trigger (emits shift value)"
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 54,
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
          top: 100,
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
          top: 94,
          fontSize: "7px",
          color: "#FF9800",
        }}
      >
        ±
      </div>

      {/* Audio Output Handle (top right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
        style={{
          top: 20,
          width: "10px",
          height: "10px",
          background: "#4CAF50",
        }}
        title="Audio Out"
      />
      <div
        style={{
          position: "absolute",
          right: 14,
          top: 14,
          fontSize: "7px",
          color: "#4CAF50",
        }}
      >
        🔊
      </div>

      {/* Flow Output Handle (bottom right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="flow-output"
        style={{
          top: 100,
          width: "10px",
          height: "10px",
          background: "#FF9800",
        }}
        title="Flow Out (emits shift value)"
      />
      <div
        style={{
          position: "absolute",
          right: 14,
          top: 94,
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
          marginTop: "20px",
          paddingBottom: "8px",
        }}
      >
        <MidiKnob
          min={-24}
          max={24}
          value={shift}
          onChange={(v) => setShift(Math.round(v))}
          midiMapping={shiftMidiMapping}
          onMidiLearnChange={setShiftMidiMapping}
          midiSensitivity={0.3}
          label="Shift"
          persistKey={
            `freqShifter:${flowId}:${nodeId}:shift`
          }
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
          value={shift}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
              setShift(
                Math.max(-24, Math.min(24, val))
              );
            }
          }}
          style={{
            width: 45,
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

export default React.memo(FrequencyShifterFlowNode);
