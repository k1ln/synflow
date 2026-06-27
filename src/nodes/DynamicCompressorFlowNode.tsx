import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

export type DynamicCompressorFlowNodeProps = {
  data: {
    label: string;
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    thresholdMidiMapping?: MidiMapping | null;
    kneeMidiMapping?: MidiMapping | null;
    ratioMidiMapping?: MidiMapping | null;
    attackMidiMapping?: MidiMapping | null;
    releaseMidiMapping?: MidiMapping | null;
  };
};

const DynamicCompressorFlowNode: React.FC<DynamicCompressorFlowNodeProps> = ({ data }) => {
  const [threshold, setThreshold] = useState(data.threshold);
  const [knee, setKnee] = useState(data.knee);
  const [ratio, setRatio] = useState(data.ratio);
  const [attack, setAttack] = useState(data.attack);
  const [release, setRelease] = useState(data.release);
  const [label, setLabel] = useState(data.label);
  const [thresholdMidiMapping, setThresholdMidiMapping] = useState<MidiMapping | null>(null);
  const [kneeMidiMapping, setKneeMidiMapping] = useState<MidiMapping | null>(null);
  const [ratioMidiMapping, setRatioMidiMapping] = useState<MidiMapping | null>(null);
  const [attackMidiMapping, setAttackMidiMapping] = useState<MidiMapping | null>(null);
  const [releaseMidiMapping, setReleaseMidiMapping] = useState<MidiMapping | null>(null);
  const nodeId = (data as any).id || 'compressor';
  const flowId = (data as any).flowId || 'default';

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, threshold, knee, ratio, attack, release, label, thresholdMidiMapping, kneeMidiMapping, ratioMidiMapping, attackMidiMapping, releaseMidiMapping });
    }
  }, [threshold, knee, ratio, attack, release, label, thresholdMidiMapping, kneeMidiMapping, ratioMidiMapping, attackMidiMapping, releaseMidiMapping]);

  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "130px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px", padding: "2px 4px" }}>
        <span><b>COMPRESSOR</b></span>
      </div>
      
      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: '10px', height: '10px' }}
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Threshold and Knee side by side */}
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
        {/* Threshold Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Thresh.</span>
          <MidiKnob
            min={-100}
            max={0}
            value={threshold}
            onChange={(v)=> setThreshold(Math.min(0, Math.max(-100, v)))}
            midiMapping={thresholdMidiMapping}
            onMidiLearnChange={setThresholdMidiMapping}
            midiSensitivity={0.5}
            label="Threshold"
            persistKey={`compressor:${flowId}:${nodeId}:threshold`}
          />
          <input
            type="text"
            value={Math.round(threshold * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setThreshold(Math.min(0, Math.max(-100, val)));
            }}
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="threshold"
            style={{ top: 55 }}
          />
        </div>

        {/* Knee Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Knee</span>
          <MidiKnob
            min={0}
            max={40}
            value={knee}
            onChange={(v)=> setKnee(Math.min(40, Math.max(0, v)))}
            midiMapping={kneeMidiMapping}
            onMidiLearnChange={setKneeMidiMapping}
            midiSensitivity={0.5}
            label="Knee"
            persistKey={`compressor:${flowId}:${nodeId}:knee`}
          />
          <input
            type="text"
            value={Math.round(knee * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setKnee(Math.min(40, Math.max(0, val)));
            }}
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="knee"
            style={{ top: 95 }}
          />
        </div>
      </div>

      {/* Ratio and Attack side by side */}
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
        {/* Ratio Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Ratio</span>
          <MidiKnob
            min={1}
            max={20}
            value={ratio}
            onChange={(v)=> setRatio(Math.min(20, Math.max(1, v)))}
            midiMapping={ratioMidiMapping}
            onMidiLearnChange={setRatioMidiMapping}
            midiSensitivity={0.6}
            label="Ratio"
            persistKey={`compressor:${flowId}:${nodeId}:ratio`}
          />
          <input
            type="text"
            value={Math.round(ratio * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setRatio(Math.min(20, Math.max(1, val)));
            }}
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="ratio"
            style={{ top: 135 }}
          />
        </div>

        {/* Attack Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Attack</span>
          <MidiKnob
            min={0}
            max={1}
            value={attack}
            onChange={(v)=> setAttack(Math.min(1, Math.max(0, v)))}
            midiMapping={attackMidiMapping}
            onMidiLearnChange={setAttackMidiMapping}
            midiSensitivity={0.6}
            label="Attack"
            persistKey={`compressor:${flowId}:${nodeId}:attack`}
          />
          <input
            type="text"
            value={Math.round(attack * 1000) / 1000}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setAttack(Math.min(1, Math.max(0, val)));
            }}
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="attack"
            style={{ top: 175 }}
          />
        </div>
      </div>

      {/* Release (single control, centered) */}
      <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
        {/* Release Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Release</span>
          <MidiKnob
            min={0}
            max={1}
            value={release}
            onChange={(v)=> setRelease(Math.min(1, Math.max(0, v)))}
            midiMapping={releaseMidiMapping}
            onMidiLearnChange={setReleaseMidiMapping}
            midiSensitivity={0.6}
            label="Release"
            persistKey={`compressor:${flowId}:${nodeId}:release`}
          />
          <input
            type="text"
            value={Math.round(release * 1000) / 1000}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setRelease(Math.min(1, Math.max(0, val)));
            }}
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="release"
            style={{ top: 215 }}
          />
        </div>
      </div>
    </div>
  );
};

export default DynamicCompressorFlowNode;