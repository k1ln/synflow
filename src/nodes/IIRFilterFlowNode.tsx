import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type IIRFilterFlowNodeProps = {
  data: {
    label: string;
    feedforward?: number[]; // Coefficients for numerator
    feedback?: number[]; // Coefficients for denominator
    /** Optional persisted MIDI mappings for each feedforward coefficient, aligned by index */
    ffMidiMappings?: (MidiMapping | null)[];
    /** Optional persisted MIDI mappings for each feedback coefficient, aligned by index */
    fbMidiMappings?: (MidiMapping | null)[];
    style?: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
  };
};

// Basic validator for coefficient arrays (finite numbers, length between 1 and 20)
const sanitizeCoefficients = (arr: any, fallback: number[]): number[] => {
  if (!Array.isArray(arr)) return fallback;
  const cleaned = arr
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (cleaned.length === 0) return fallback;
  return cleaned.slice(0, 20); // hard safety cap
};

const DEFAULT_FF = [0.5, 0.5];
const DEFAULT_FB = [1.0, -0.5];

const IIRFilterFlowNode: React.FC<IIRFilterFlowNodeProps> = ({ data }) => {
  const initialFF = sanitizeCoefficients(data.feedforward ?? DEFAULT_FF, DEFAULT_FF);
  const initialFB = sanitizeCoefficients(data.feedback ?? DEFAULT_FB, DEFAULT_FB);
  const [feedforward, setFeedforward] = useState<number[]>(initialFF);
  const [feedback, setFeedback] = useState<number[]>(initialFB);
  // Initialize MIDI mappings from saved data if present; otherwise default to nulls per coefficient
  const [ffMidiMappings, setFfMidiMappings] = useState<(MidiMapping | null)[]>(() => {
    const saved = Array.isArray(data.ffMidiMappings) ? data.ffMidiMappings! : [];
    return initialFF.map((_, i) => saved[i] ?? null);
  });
  const [fbMidiMappings, setFbMidiMappings] = useState<(MidiMapping | null)[]>(() => {
    const saved = Array.isArray(data.fbMidiMappings) ? data.fbMidiMappings! : [];
    return initialFB.map((_, i) => saved[i] ?? null);
  });
  const nodeLabel = data.label || "IIR Filter";

  // Emit param changes to graph manager (mirrors pattern in other nodes)
  useEffect(() => {
    if (typeof data.onChange === 'function') {
      data.onChange({ ...data, feedforward, feedback, label: nodeLabel, ffMidiMappings, fbMidiMappings });
    }
  }, [feedforward, feedback, nodeLabel, ffMidiMappings, fbMidiMappings]);

  // Keep mapping arrays aligned with coefficient counts when user adds/removes entries
  useEffect(() => {
    setFfMidiMappings((m) => feedforward.map((_, i) => m[i] ?? null));
  }, [feedforward]);
  useEffect(() => {
    setFbMidiMappings((m) => feedback.map((_, i) => m[i] ?? null));
  }, [feedback]);

  if (!data.style) {
    data.style = {
      padding: "10px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "220px",
      textAlign: "center",
      background: "#121212",
      color: "#eee",
    };
  }

  const updateCoeff = (arr: number[], idx: number, value: number, setter: (v: number[])=>void) => {
    const copy = [...arr];
    copy[idx] = value;
    setter(sanitizeCoefficients(copy, copy));
  };

  const addCoeff = (target: 'ff' | 'fb') => {
    if (target === 'ff') {
      setFeedforward(f => [...f, 0]);
      setFfMidiMappings(m => [...m, null]);
    } else {
      setFeedback(f => [...f, 0]);
      setFbMidiMappings(m => [...m, null]);
    }
  };
  const removeCoeff = (target: 'ff' | 'fb', index: number) => {
    if (target === 'ff') {
      setFeedforward(f => f.filter((_,i)=> i!==index));
      setFfMidiMappings(m => m.filter((_,i)=> i!==index));
    } else {
      setFeedback(f => f.filter((_,i)=> i!==index));
      setFbMidiMappings(m => m.filter((_,i)=> i!==index));
    }
  };

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ gap: 4, marginBottom: 8 }}>
        <span className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>IIR FILTER</span>
        <span
          title="Feedforward coefficients shape the immediate response; feedback coefficients loop energy back for resonance."
          style={{ cursor: 'help', fontSize: '0.7rem', opacity: 0.7 }}
        >
          ?
        </span>
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

      {/* Feedforward Coefficients */}
      <div style={{ marginTop: 6 }}>
        <div className="node-label" style={{ textAlign: 'center' }}>Feedforward</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
          {feedforward.map((v,i)=>(
            <div key={i} className="node-field" style={{ marginBottom: 0 }}>
              <input
                type="number"
                value={Math.round(v*1000)/1000}
                onChange={(e)=> updateCoeff(feedforward, i, parseFloat(e.target.value)||0, setFeedforward)}
                className="nodrag node-input"
                style={{ width: 50 }}
              />
              <MidiKnob
                accentColor="#60a5fa"
                min={-2}
                max={2}
                value={v}
                onChange={(val)=> updateCoeff(feedforward, i, val, setFeedforward)}
                midiMapping={ffMidiMappings[i] || undefined}
                onMidiLearnChange={(m)=> setFfMidiMappings(mm => mm.map((old,idx)=> idx===i? m: old))}
                persistKey={`iir:${data.flowId||'flow'}:${data.id||'node'}:ff:${i}`}
                midiSensitivity={0.8}
                midiSmoothing={0.4}
              />
              <button onClick={()=> removeCoeff('ff', i)} className="node-btn node-btn-danger" style={{ marginTop:4, width: '100%' }}>x</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop:6 }}>
          <button className="node-btn" style={{ width:'100%' }} onClick={()=> addCoeff('ff')}>Add coefficient</button>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="feedforward"
          style={{ top: 75 }}
        />
      </div>

      {/* Feedback Coefficients */}
      <div style={{ marginTop: 10 }}>
        <div className="node-label" style={{ textAlign: 'center' }}>Feedback</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
          {feedback.map((v,i)=>(
            <div key={i} className="node-field" style={{ marginBottom: 0 }}>
              <input
                type="number"
                value={Math.round(v*1000)/1000}
                onChange={(e)=> updateCoeff(feedback, i, parseFloat(e.target.value)||0, setFeedback)}
                className="nodrag node-input"
                style={{ width: 50 }}
              />
              <MidiKnob
                accentColor="#60a5fa"
                min={-2}
                max={2}
                value={v}
                onChange={(val)=> updateCoeff(feedback, i, val, setFeedback)}
                midiMapping={fbMidiMappings[i] || undefined}
                onMidiLearnChange={(m)=> setFbMidiMappings(mm => mm.map((old,idx)=> idx===i? m: old))}
                persistKey={`iir:${data.flowId||'flow'}:${data.id||'node'}:fb:${i}`}
                midiSensitivity={0.8}
                midiSmoothing={0.4}
              />
              <button onClick={()=> removeCoeff('fb', i)} className="node-btn node-btn-danger" style={{ marginTop:4, width: '100%' }}>x</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop:6 }}>
          <button className="node-btn" style={{ width:'100%' }} onClick={()=> addCoeff('fb')}>Add coefficient</button>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="feedback"
          style={{ top: 125 }}
        />
      </div>
    </div>
  );
};

export const defaultData = {
  feedforward: [0.5, 0.5],
  feedback: [1.0, -0.5],
  label: "IIR Filter",
};

export default React.memo(IIRFilterFlowNode);