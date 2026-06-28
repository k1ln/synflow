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
    <div className="flow-node" style={data.style}>
      <div className="node-title">{label?.toUpperCase() ?? "REVERB"}</div>

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

      <div className="node-field">
        <MidiKnob
          accentColor="#60a5fa"
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
        <span className="node-label">Time (s)</span>
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
          className="node-input"
          style={{ width: 60 }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="seconds"
          style={{ top: 75 }}
        />
      </div>

      <div className="node-field">
        <MidiKnob
          accentColor="#60a5fa"
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
        <span className="node-label">Decay</span>
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
          className="node-input"
          style={{ width: 60 }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="decay"
          style={{ top: 145 }}
        />
      </div>

      <div className="node-field">
        <label className="node-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
          className="node-btn"
          onClick={() => setShowFormula((prev) => !prev)}
        >
          {showFormula ? "Hide Formula" : "Show Formula"}
        </button>
        {showFormula && (
          <textarea
            value={formula}
            onChange={(event) => setFormula(event.target.value)}
            className="nodrag"
            style={{ width: "100%", minHeight: 60, fontSize: 10, padding: 4, resize: "vertical", boxSizing: "border-box" }}
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

export default ReverbFlowNode;
