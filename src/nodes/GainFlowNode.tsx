import React, { useState,useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type GainFlowNodeProps = {
  data: {
    label: string;
    gain: number;
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

const GainFlowNode: React.FC<GainFlowNodeProps> = ({ data }) => {
  // Piecewise mapping:
  // 0..0.5 knob -> 0..MID_GAIN (gentle exponent LOW_EXP)
  // 0.5..1 knob -> MID_GAIN..MAX_GAIN (exponent HIGH_EXP)
  // Ensures f(0.5)=MID_GAIN, f(1)=MAX_GAIN, f(0)=0, but flatter than single huge exponent.
  const MAX_GAIN = 10000;
  const MID_GAIN = 5;
  const LOW_EXP = 1.3;   // adjust for curvature below midpoint (1 = linear)
  const HIGH_EXP = 2.2;  // adjust for curvature above midpoint

  const knobToGain = (k: number) => {
    if (k < 0.003) return 0; // avoid tiny nonzero gains
    if (k < 0.5) {
      const norm = k / 0.5; // 0..1
      return MID_GAIN * Math.pow(norm, LOW_EXP);
    }
    if (k >= 1) return MAX_GAIN;
    const norm = (k - 0.5) / 0.5; // 0..1
    return MID_GAIN + (MAX_GAIN - MID_GAIN) * Math.pow(norm, HIGH_EXP);
  };

  const gainToKnob = (g: number) => {
    if (g <= 0) return 0;
    if (g < MID_GAIN) {
      const norm = Math.pow(g / MID_GAIN, 1 / LOW_EXP); // 0..1
      return norm * 0.5;
    }
    if (g >= MAX_GAIN) return 1;
    const norm = Math.pow((g - MID_GAIN) / (MAX_GAIN - MID_GAIN), 1 / HIGH_EXP); // 0..1
    return 0.5 + norm * 0.5;
  };
  const initialGain = data.gain ?? 0;
  const nodeId = (data as any).id;
  const flowId = (data as any).flowId || 'default';
  const [gain, setGain] = useState<number>(initialGain);
  const [gainKnob, setGainKnob] = useState<number>(gainToKnob(initialGain));
  const [label, setLabel] = useState(data.label);
  const [gainMidiMapping, setGainMidiMapping] = useState<MidiMapping | null>(null);
  const [gainInput, setGainInput] = useState<string>(Number.isFinite(initialGain) ? initialGain.toFixed(4) : '');
  useEffect(() => {
    // Sync gainInput with gain when gain changes from knob or programmatically
    setGainInput(Number.isFinite(gain) ? gain.toFixed(4) : '');
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, gain, label, gainMidiMapping });
    }
    // ...additional logic...
  }, [gain, label]);
  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "40px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>GAIN</b></span>
      </div>

      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: "10px", height: "10px" }}
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Gain Input with MIDI-learnable knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <MidiKnob
          min={0}
          max={1}
          value={gainKnob}
          onChange={(k)=> {
            const kClamped = Math.min(1, Math.max(0, k));
            setGainKnob(kClamped);
            const g = knobToGain(kClamped);
            setGain(g);
          }}
          midiMapping={gainMidiMapping}
          onMidiLearnChange={setGainMidiMapping}
          midiSensitivity={0.5}
          midiSmoothing={0.5}
          label="Gain"
          persistKey={nodeId ? `gain:${flowId}:${nodeId}` : undefined}
        />
        <input
          type="text"
          value={gainInput}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            // Only update the input field, not the gain value
            setGainInput(e.target.value);
          }}
          onBlur={() => {
            // On blur, update gain only if valid, else set to 0
            const val = gainInput;
            const num = parseFloat(val);
            if (val === '' || isNaN(num)) {
              setGain(0);
              setGainKnob(gainToKnob(0));
              setGainInput('0.0000');
            } else {
              const clamped = Math.min(MAX_GAIN, Math.max(0, num));
              setGain(clamped);
              setGainKnob(gainToKnob(clamped));
              setGainInput(clamped.toFixed(4));
            }
          }}
          style={{
            width: 55,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '1px 3px',
            fontSize: 10,
            textAlign: 'center',
            marginBottom: '3px',
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="gain"
          style={{ top: 55 }}
        />
      </div>
    </div>
  );
};

export default GainFlowNode;