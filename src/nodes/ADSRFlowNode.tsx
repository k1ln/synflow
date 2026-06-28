import React, { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";

import "./AudioNode.css";
import MidiKnob from "../components/MidiKnob";

export type ADSRFlowNodeProps = {
  data: {
    label: string;
    attackTime: number;
    sustainTime: number;
    sustainLevel: number;
    releaseTime: number;
    minPercent?: number; // -1000..1000 default 0
    maxPercent?: number; // -1000..1000 default 100
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

const ADSRFlowNode: React.FC<ADSRFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label || "ADSR");
  const [attackTime, setAttackTime] = useState(data.attackTime || 0.1);
  const [sustainTime, setSustainTime] = useState(data.sustainTime || 0.5);
  const [sustainLevel, setSustainLevel] = useState(data.sustainLevel || 0.7);
  const [releaseTime, setReleaseTime] = useState(data.releaseTime || 0.3);
  // Removed maxTime concept; use fixed upper bounds per control
  const [minPercent, setMinPercent] = useState(
    typeof data.minPercent === 'number' ? data.minPercent : 0
  );
  const [maxPercent, setMaxPercent] = useState(
    typeof data.maxPercent === 'number' ? data.maxPercent : 100
  );
  // Per-phase maximum (upper bound for each A/S/R individually, not total envelope length)
  const [lengthSec, setLengthSec] = useState<number>(() => {
    const base = (data as any).lengthSec;
    if (typeof base === 'number' && base > 0) return base;
    // default: largest of existing phases (so we don't auto-scale them)
    return Math.max(data.attackTime || 0.1, data.sustainTime || 0.5, data.releaseTime || 0.3, 0.1);
  });

  useEffect(() => {
    if (data.onChange instanceof Function) {
      const { maxTime: _removed, ...rest } = data as any;
      data.onChange({ ...rest, attackTime, sustainTime, sustainLevel, releaseTime, label, minPercent, maxPercent, lengthSec });
    }
  }, [attackTime, sustainTime, sustainLevel, releaseTime, label, minPercent, maxPercent, lengthSec]);

  // When user edits lengthSec directly, just clamp each phase to the new max; do NOT rescale proportions.
  const applyNewLength = (newLen:number) => {
    const clamped = Math.max(0.001, Math.min(60, newLen));
    const finalLen = parseFloat(clamped.toFixed(3));
    setLengthSec(finalLen);
    if (attackTime > finalLen) setAttackTime(parseFloat(finalLen.toFixed(3)));
    if (sustainTime > finalLen) setSustainTime(parseFloat(finalLen.toFixed(3)));
    if (releaseTime > finalLen) setReleaseTime(parseFloat(finalLen.toFixed(3)));
  };

  function clampPhase(v:number){ return Math.max(0, Math.min(lengthSec, v)); }
  function changeAttackTime(value: number) {
    setAttackTime(parseFloat(clampPhase(value).toFixed(3)));
  }
  function changeSustainTime(value: number) {
    setSustainTime(parseFloat(clampPhase(value).toFixed(3)));
  }
  function changeSustainLevel(value: number) {
    setSustainLevel(parseFloat(Math.max(0, Math.min(1, value)).toFixed(3)));
  }
  function changeReleaseTime(value: number) {
    setReleaseTime(parseFloat(clampPhase(value).toFixed(3)));
  }

  function clampPercent(v:number){ return Math.max(-1000, Math.min(1000, Math.floor(v))); }
  function changeMinPercent(v:number){ setMinPercent(clampPercent(v)); }
  function changeMaxPercent(v:number){ setMaxPercent(clampPercent(v)); }


  // Deterministic vivid color generator per handle id
  function vividColor(seed: string): string {
    // Simple hash
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h << 5) - h + seed.charCodeAt(i);
      h |= 0;
    }
    // Map hash to HSL with high saturation & medium/high lightness
    const hue = Math.abs(h) % 360;
    const sat = 55; // softened saturation
    const light = 45 + (Math.abs(h >> 8) % 12); // 45..56 slightly dimmer
    return `hsl(${hue}deg ${sat}% ${light}%)`;
  }

  const handleColor = (id: string) => vividColor((data as any).id + ':' + id);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-title">ADSR</div>
      <div className="node-row" style={{ gap: 6, marginBottom: 6 }}>
        <label className="node-label">Phase Max (s)</label>
        <input
          type="text"
          value={lengthSec.toFixed(3)}
          onChange={(e)=>{
            const raw = e.target.value.trim();
            if (/^\d*(?:\.\d{0,3})?$/.test(raw)) {
              const num = parseFloat(raw);
              if(!isNaN(num)) applyNewLength(num);
            }
          }}
          onKeyDown={(e)=>{
            let delta=0;
            if(e.key==='ArrowUp') delta=0.01;
            else if(e.key==='ArrowDown') delta=-0.01;
            else if(e.key==='ArrowRight') delta=1;
            else if(e.key==='ArrowLeft') delta=-1;
            if(delta!==0){
              e.preventDefault();
              applyNewLength(lengthSec + delta);
            }
          }}
          className="nodrag node-input"
          style={{ width: 70 }}
          title="Upper bound for each phase (Attack/Sustain/Release). Up/Down: ±0.01s, Left/Right: ±1s"
        />
      </div>
        
      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: '8px', height: '8px', background: '#ffffff', border: '1px solid #333', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(255,255,255,0.45)' }}
        title="Gate / Trigger input (starts ADSR)"
      />
      {/* Attack Time Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="attack-input"
        style={{ top: 50, width: '8px', height: '8px', background: '#4F8EF7', border: '1px solid #1d3f73', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(79,142,247,0.38)' }}
        title="Modulate Attack Time (seconds)"
      />
      {/* Sustain Time Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="sustainTime-input"
        style={{ top: 80, width: '8px', height: '8px', background: '#47C29D', border: '1px solid #1e5e4d', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(71,194,157,0.34)' }}
        title="Modulate Decay Time (seconds)"
      />
      {/* Sustain Level Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="sustainLevel-input"
        style={{ top: 110, width: '8px', height: '8px', background: '#FFB347', border: '1px solid #7a4c18', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(255,179,71,0.34)' }}
        title="Modulate Sustain Level (0-1)"
      />
      {/* Release Time Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="release-input"
        style={{ top: 140, width: '8px', height: '8px', background: '#D779E8', border: '1px solid #5e2d6b', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(215,121,232,0.34)' }}
        title="Modulate Release Time (seconds)"
      />
      {/* Min Percent Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="minPercent-input"
        style={{ top: 170, width: '8px', height: '8px', background: '#9AA3AF', border: '1px solid #3d434a', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(154,163,175,0.34)' }}
        title="Modulate Minimum Percent (-1000 to 1000)"
      />
      {/* Max Percent Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="maxPercent-input"
        style={{ top: 200, width: '8px', height: '8px', background: '#B366FF', border: '1px solid #4d2673', borderRadius: '50%', boxShadow: '0 0 3px 1px rgba(179,102,255,0.34)' }}
        title="Modulate Maximum Percent (-1000 to 1000)"
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* ADSR Phase Controls */}
      <div className="node-row" style={{ marginBottom: 10 }}>
        <div className="node-field" style={{ minWidth: 50, marginBottom: 0 }}>
          <label className="node-label">Attack</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            accentColor="#facc15"
            min={0}
            max={lengthSec}
            value={attackTime}
            onChange={(e)=> changeAttackTime(e)}
          />
          <span className="node-readout">{attackTime.toFixed(3)}</span>
        </div>
        <div className="node-field" style={{ minWidth: 50, marginBottom: 0 }}>
          <label className="node-label">Decay</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            accentColor="#facc15"
            min={0}
            max={lengthSec}
            value={sustainTime}
            onChange={(e)=> changeSustainTime(e)}
          />
          <span className="node-readout">{sustainTime.toFixed(3)}</span>
        </div>
        <div className="node-field" style={{ minWidth: 50, marginBottom: 0 }}>
          <label className="node-label">Level</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            accentColor="#facc15"
            min={0}
            max={1}
            value={sustainLevel}
            onChange={(e)=> changeSustainLevel(e)}
          />
          <span className="node-readout">{sustainLevel.toFixed(3)}</span>
        </div>
        <div className="node-field" style={{ minWidth: 50, marginBottom: 0 }}>
          <label className="node-label">Release</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            accentColor="#facc15"
            min={0}
            max={lengthSec}
            value={releaseTime}
            onChange={(e)=> changeReleaseTime(e)}
          />
          <span className="node-readout">{releaseTime.toFixed(3)}</span>
        </div>
      </div>
      <div className="node-row" style={{ marginTop: 4 }}>
        <div className="node-field" style={{ marginBottom: 0 }}>
          <label className="node-label">Min %</label>
          <MidiKnob
            accentColor="#facc15"
            min={-1000}
            max={1000}
            value={minPercent}
            onChange={(e)=> changeMinPercent(e)}
            style={{ display:'inline-block' }}
          />
          <span className="node-readout">{minPercent}</span>
        </div>
        <div className="node-field" style={{ marginBottom: 0 }}>
          <label className="node-label">Max %</label>
          <MidiKnob
            accentColor="#facc15"
            min={-1000}
            max={1000}
            value={maxPercent}
            onChange={(e)=> changeMaxPercent(e)}
            style={{ display:'inline-block' }}
          />
          <span className="node-readout">{maxPercent}</span>
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  attackTime: 0.1,
  decayTime: 0.2,
  sustainLevel: 0.5,
  releaseTime: 0.3,
  maxTime: 10,
};

export default ADSRFlowNode;