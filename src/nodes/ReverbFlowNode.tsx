import React, { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

const DEFAULT_FORMULA = "(Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)";

export type ReverbFlowNodeProps = {
  data: {
    label?: string;
    seconds?: number;
    decay?: number;
    reverse?: boolean;
    formula?: string;
    style?: React.CSSProperties;
    secondsMidiMapping?: MidiMapping | null;
    decayMidiMapping?: MidiMapping | null;
    secondsKnobValue?: number;
    decayKnobValue?: number;
    onChange?: (data: any) => void;
  };
};

const MIN_SECONDS = 0.1;
const MAX_SECONDS = 50;
const MIN_DECAY = 0.01;
const MAX_DECAY = 100;

const ReverbFlowNode: React.FC<ReverbFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(() => data.label ?? "Reverb");
  const [seconds, setSeconds] = useState(() => {
    const initial = data.seconds ?? 3;
    return clamp(initial, MIN_SECONDS, MAX_SECONDS);
  });
  const [decay, setDecay] = useState(() => {
    const initial = data.decay ?? 2;
    return clamp(initial, MIN_DECAY, MAX_DECAY);
  });
  const [reverse, setReverse] = useState(() => !!data.reverse);
  const [formula, setFormula] = useState(() => data.formula ?? DEFAULT_FORMULA);
  const [secondsKnob, setSecondsKnob] = useState(() => secondsToKnob(data.secondsKnobValue ?? seconds));
  const [decayKnob, setDecayKnob] = useState(() => decayToKnob(data.decayKnobValue ?? decay));
  const [secondsMidiMapping, setSecondsMidiMapping] = useState<MidiMapping | null>(data.secondsMidiMapping ?? null);
  const [decayMidiMapping, setDecayMidiMapping] = useState<MidiMapping | null>(data.decayMidiMapping ?? null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    if (typeof data.onChange === "function") {
      data.onChange({
        ...data,
        label,
        seconds,
        decay,
        reverse,
        formula,
        secondsKnobValue: secondsKnob,
        decayKnobValue: decayKnob,
        secondsMidiMapping,
        decayMidiMapping,
      });
    }
  }, [label, seconds, decay, reverse, formula, secondsKnob, decayKnob, secondsMidiMapping, decayMidiMapping]);

  if (!data.style) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "70px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    };
  }

  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px", fontSize: "10px" }}>
        <span><b>{label?.toUpperCase() ?? "REVERB"}</b></span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: "10px", height: "10px" }}
      />

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <MidiKnob
          min={0}
          max={1}
          value={secondsKnob}
          onChange={(value) => {
            const knob = clamp(value, 0, 1);
            setSecondsKnob(knob);
            const secs = knobToSeconds(knob);
            setSeconds(secs);
          }}
          midiMapping={secondsMidiMapping ?? undefined}
          onMidiLearnChange={setSecondsMidiMapping}
          persistKey={`reverb:${(data as any).flowId || "default"}:${(data as any).id || "node"}:seconds`}
          midiSensitivity={0.8}
          midiSmoothing={0.4}
        />
        <span style={{ fontSize: 10 }}>Time (s)</span>
        <input
          type="text"
          value={Number.isFinite(seconds) ? seconds.toFixed(2) : ""}
          onChange={(event) => {
            const parsed = parseFloat(event.target.value);
            if (isNaN(parsed)) return;
            const clamped = clamp(parsed, MIN_SECONDS, MAX_SECONDS);
            setSeconds(clamped);
            setSecondsKnob(secondsToKnob(clamped));
          }}
          style={fieldStyle}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="seconds"
          style={{ top: 75 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 6 }}>
        <MidiKnob
          min={0}
          max={1}
          value={decayKnob}
          onChange={(value) => {
            const knob = clamp(value, 0, 1);
            setDecayKnob(knob);
            const newDecay = knobToDecay(knob);
            setDecay(newDecay);
          }}
          midiMapping={decayMidiMapping ?? undefined}
          onMidiLearnChange={setDecayMidiMapping}
          persistKey={`reverb:${(data as any).flowId || "default"}:${(data as any).id || "node"}:decay`}
          midiSensitivity={0.8}
          midiSmoothing={0.4}
        />
        <span style={{ fontSize: 10 }}>Decay</span>
        <input
          type="text"
          value={Number.isFinite(decay) ? decay.toFixed(2) : ""}
          onChange={(event) => {
            const parsed = parseFloat(event.target.value);
            if (isNaN(parsed)) return;
            const clamped = clamp(parsed, MIN_DECAY, MAX_DECAY);
            setDecay(clamped);
            setDecayKnob(decayToKnob(clamped));
          }}
          style={fieldStyle}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="decay"
          style={{ top: 145 }}
        />
      </div>

      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={reverse}
            onChange={(event) => setReverse(event.target.checked)}
          />
          Reverse
        </label>
        <Handle
          type="target"
          position={Position.Left}
          id="reverse"
          style={{ top: 175 }}
        />

        <button
          type="button"
          onClick={() => setShowFormula((prev) => !prev)}
          style={formulaToggleStyle}
        >
          {showFormula ? "Hide Formula" : "Show Formula"}
        </button>
        {showFormula && (
          <textarea
            value={formula}
            onChange={(event) => setFormula(event.target.value)}
            style={formulaAreaStyle}
          />
        )}
        <Handle
          type="target"
          position={Position.Left}
          id="formula"
          style={{ top: 205 }}
        />
      </div>
    </div>
  );
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function secondsToKnob(value: number) {
  const clamped = clamp(value, MIN_SECONDS, MAX_SECONDS);
  const logMin = Math.log10(MIN_SECONDS);
  const logMax = Math.log10(MAX_SECONDS);
  return (Math.log10(clamped) - logMin) / (logMax - logMin);
}

function knobToSeconds(value: number) {
  const logMin = Math.log10(MIN_SECONDS);
  const logMax = Math.log10(MAX_SECONDS);
  const logValue = logMin + value * (logMax - logMin);
  return Math.pow(10, logValue);
}

function decayToKnob(value: number) {
  const clamped = clamp(value, MIN_DECAY, MAX_DECAY);
  const logMin = Math.log10(MIN_DECAY);
  const logMax = Math.log10(MAX_DECAY);
  return (Math.log10(clamped) - logMin) / (logMax - logMin);
}

function knobToDecay(value: number) {
  const logMin = Math.log10(MIN_DECAY);
  const logMax = Math.log10(MAX_DECAY);
  const logValue = logMin + value * (logMax - logMin);
  return Math.pow(10, logValue);
}

const fieldStyle: React.CSSProperties = {
  width: 60,
  background: "#222",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "2px 3px",
  fontSize: 11,
  textAlign: "center",
};

const formulaToggleStyle: React.CSSProperties = {
  background: "#2a2a2a",
  color: "#bbb",
  border: "1px solid #444",
  borderRadius: 4,
  fontSize: 9,
  padding: "2px 6px",
  cursor: "pointer",
};

const formulaAreaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 60,
  background: "#111",
  color: "#ccf",
  border: "1px solid #333",
  borderRadius: 4,
  fontSize: 10,
  padding: 4,
  resize: "vertical",
};

export default ReverbFlowNode;
