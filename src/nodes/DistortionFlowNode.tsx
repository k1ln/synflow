import React, { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type DistortionFlowNodeProps = {
  data: {
    label: string;
    curve: string; // Curve values as a comma-separated string
    oversample: OverSampleType; // "none" | "2x" | "4x"
    style: React.CSSProperties;
    preset?: string;
    formula?: string;
    drive?: number;
    driveKnob?: number;
    driveMidiMapping?: MidiMapping | null;
    onChange?: (data: any) => void;
  };
};

type Preset = {
  name: string;
  formula: string;
  description: string;
};

const PRESETS: Preset[] = [
  { name: "Soft Clip", formula: "Math.tanh(x*3)", description: "Smooth tube-like distortion" },
  { name: "Hard Clip", formula: "Math.max(-0.7,Math.min(0.7,x*2))", description: "Aggressive clipping" },
  { name: "Heavy Dist", formula: "Math.tanh(x*8)", description: "Heavy guitar distortion" },
  { name: "Fuzz", formula: "Math.sign(x)*Math.pow(Math.abs(x),0.3)", description: "Classic fuzz pedal" },
  { name: "Metal", formula: "Math.max(-0.9,Math.min(0.9,Math.tanh(x*10)))", description: "High-gain metal tone" },
  { name: "Asymmetric", formula: "x>0?Math.tanh(x*4):x*0.8", description: "Different positive/negative" },
  { name: "Fold", formula: "Math.abs(x)>0.5?Math.sign(x)*(1-Math.abs(x)):x*2", description: "Wave folding effect" },
  { name: "Bit Crush", formula: "Math.round(x*8)/8", description: "Quantization/digital distortion" },
  { name: "Sine Fold", formula: "Math.sin(x*3.14159)", description: "Smooth harmonic folding" },
  { name: "Overdrive", formula: "x>0?Math.min(1,x*2.5):Math.max(-1,x*2.5)", description: "Tube overdrive" },
  { name: "Custom", formula: "", description: "Enter your own formula" },
];

const DRIVE_KNOB_MIN = 0;
const DRIVE_KNOB_MAX = 100;
const DRIVE_MIN = 0.1;
const DRIVE_MAX = 100;

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Map the 0-100 UI knob range onto a logarithmic drive multiplier up to 100x.
const knobToDriveMultiplier = (knobValue: number): number => {
  const normalized = (clampValue(knobValue, DRIVE_KNOB_MIN, DRIVE_KNOB_MAX) - DRIVE_KNOB_MIN) / (DRIVE_KNOB_MAX - DRIVE_KNOB_MIN || 1);
  const span = DRIVE_MAX / DRIVE_MIN;
  const multiplier = DRIVE_MIN * Math.pow(span, normalized);
  return clampValue(multiplier, DRIVE_MIN, DRIVE_MAX);
};

const driveMultiplierToKnob = (driveAmount: number): number => {
  const safeValue = clampValue(driveAmount, DRIVE_MIN, DRIVE_MAX);
  const span = DRIVE_MAX / DRIVE_MIN;
  const normalized = Math.log(safeValue / DRIVE_MIN) / Math.log(span);
  return DRIVE_KNOB_MIN + normalized * (DRIVE_KNOB_MAX - DRIVE_KNOB_MIN);
};

const DistortionFlowNode: React.FC<DistortionFlowNodeProps> = ({ data }) => {
  const [curve, setCurve] = useState(data.curve || "");
  const [oversample, setOversample] = useState<OverSampleType>(data.oversample || "none");
  const [label, setLabel] = useState(data.label || "Distortion");
  const [preset, setPreset] = useState(data.preset || "Soft Clip");
  const [formula, setFormula] = useState(data.formula || "Math.tanh(x*3)");
  const initialDriveKnob = (() => {
    if (typeof data.driveKnob === 'number') {
      return clampValue(data.driveKnob, DRIVE_KNOB_MIN, DRIVE_KNOB_MAX);
    }
    const driveValue = typeof data.drive === 'number' && Number.isFinite(data.drive) ? data.drive : 1;
    return clampValue(driveMultiplierToKnob(driveValue), DRIVE_KNOB_MIN, DRIVE_KNOB_MAX);
  })();
  const [driveKnob, setDriveKnob] = useState(initialDriveKnob);
  const [driveMidiMapping, setDriveMidiMapping] = useState<MidiMapping | null>(data.driveMidiMapping || null);
  const [showFormula, setShowFormula] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeId = (data as any).id;
  const flowId = (data as any).flowId || 'default';
  const onChangeRef = useRef(data.onChange);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = data.onChange;
  }, [data.onChange]);

  // Generate curve from formula
  const driveAmount = knobToDriveMultiplier(driveKnob);

  const generateCurve = (formula: string, amount: number): Float32Array => {
    const samples = 256;
    const curve = new Float32Array(samples);
    
    try {
      for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * 2 - 1; // -1 to 1
        const xDriven = x * amount;
        
        // Safe eval using Function constructor with Math in scope
        const safeFormula = formula
          .replace(/\bx\b/g, `(${xDriven})`);
        
        // Create function with Math explicitly passed as parameter
        const fn = new Function('Math', 'return ' + safeFormula);
        let y = fn(Math);
        
        // Clamp output to -1..1
        y = Math.max(-1, Math.min(1, y));
        curve[i] = y;
      }
    } catch (e) {
      console.error('Formula error:', e);
      // Fallback to linear
      for (let i = 0; i < samples; i++) {
        curve[i] = (i / (samples - 1)) * 2 - 1;
      }
    }
    
    return curve;
  };

  // Draw curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width;
    const h = canvas.height;
    
    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    
    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    
    // Reference line (input = output)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    
    // Generate and draw curve
    const curveData = generateCurve(formula, driveAmount);
    
    ctx.strokeStyle = '#0af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < curveData.length; i++) {
      const x = (i / (curveData.length - 1)) * w;
      const y = h - ((curveData[i] + 1) / 2) * h; // Map -1..1 to h..0
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
  }, [formula, driveAmount]);

  // Update curve string for audio processing
  useEffect(() => {
    const curveData = generateCurve(formula, driveAmount);
    const curveString = Array.from(curveData).join(',');
    setCurve(curveString);
    
    if (typeof onChangeRef.current === 'function') {
      onChangeRef.current({
        ...data,
        curve: curveString,
        oversample,
        label,
        preset,
        formula,
        drive: driveAmount,
        driveKnob,
        driveMidiMapping,
      });
    }
  }, [formula, driveAmount, driveKnob, oversample, label, preset, driveMidiMapping]);

  const handlePresetChange = (presetName: string) => {
    setPreset(presetName);
    const presetData = PRESETS.find(p => p.name === presetName);
    if (presetData && presetData.formula) {
      setFormula(presetData.formula);
      setShowFormula(false);
    } else if (presetName === "Custom") {
      setShowFormula(true);
    }
  };

  if (data.style === undefined) {
    data.style = {
      padding: "8px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "180px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }

  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "4px", fontSize: "10px" }}>
        <span><b>DISTORTION</b></span>
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

      {/* Canvas and Drive side by side */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
        {/* Canvas visualization */}
        <canvas
          ref={canvasRef}
          width={82}
          height={60}
          style={{
            border: '1px solid #444',
            borderRadius: 4,
            background: '#1a1a1a',
          }}
        />

        {/* Drive control */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9, marginBottom: 2 }}>Drive</span>
          <MidiKnob
            min={DRIVE_KNOB_MIN}
            max={DRIVE_KNOB_MAX}
            value={driveKnob}
            onChange={setDriveKnob}
            midiMapping={driveMidiMapping}
            onMidiLearnChange={setDriveMidiMapping}
            persistKey={`distortion:${flowId}:${nodeId}:drive`}
            midiSensitivity={0.5}
            midiSmoothing={0.3}
          />
          <input
            type="text"
            value={driveAmount.toFixed(2)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) {
                const clamped = clampValue(v, DRIVE_MIN, DRIVE_MAX);
                setDriveKnob(driveMultiplierToKnob(clamped));
              }
            }}
            style={{
              width: 45,
              background: '#222',
              color: '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              padding: '1px 2px',
              fontSize: 9,
              textAlign: 'center',
              marginTop: 2,
            }}
          />
        </div>
      </div>

      {/* Preset selector */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, display: 'block', marginBottom: 2 }}>Preset</label>
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          style={{
            width: '100%',
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '2px 4px',
            fontSize: 10,
          }}
        >
          {PRESETS.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Formula input (toggle) */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setShowFormula(!showFormula)}
          style={{
            width: '100%',
            background: '#333',
            color: '#eee',
            border: '1px solid #555',
            borderRadius: 4,
            padding: '3px 4px',
            fontSize: 9,
            cursor: 'pointer',
          }}
        >
          {showFormula ? '▼' : '▶'} Formula
        </button>
        {showFormula && (
          <textarea
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="e.g., Math.tanh(x*3) or Math.sin(x*3.14159)"
            style={{
              width: '100%',
              height: 50,
              background: '#222',
              color: '#eee',
              border: '1px solid #444',
              borderRadius: 4,
              padding: '3px',
              fontSize: 9,
              fontFamily: 'monospace',
              marginTop: 4,
              resize: 'none',
            }}
          />
        )}
      </div>

      {/* Oversample selector */}
      <div style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 10, display: 'block', marginBottom: 2 }}>Oversample</label>
        <select
          value={oversample}
          onChange={(e) => setOversample(e.target.value as OverSampleType)}
          style={{
            width: '100%',
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '2px 4px',
            fontSize: 10,
          }}
        >
          <option value="none">None</option>
          <option value="2x">2x</option>
          <option value="4x">4x</option>
        </select>
      </div>
    </div>
  );
};

export default DistortionFlowNode;