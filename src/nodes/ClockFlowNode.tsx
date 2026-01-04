import React, { useEffect, useState, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";
import {CustomNumberInput} from "../util/CustomNumberInput";

export type ClockNodeProps = {
  id: string;
  data: {
    bpm: number; // Beats per minute
    onChange: (data: any) => void;
    // Optional OFF event configuration (mirrors VirtualClockNode expectations)
    sendOff?: boolean;                 // emit OFF event
    offDelayMs?: number | string;      // after ON (default 50) or before next ON if sendOffBeforeNextOn
    sendOffBeforeNextOn?: boolean;     // schedule OFF before next ON instead of after current ON
  };
};

const ClockFlowNode: React.FC<ClockNodeProps> = ({ id, data }) => {
  const [bpm, setBpm] = useState(data.bpm || 60); // Default to 60 BPM
  const [isEmitting, setIsEmitting] = useState(
    data.isEmitting !== undefined ? data.isEmitting : true
  );
  const [sendOff, setSendOff] = useState(!!data.sendOff);
  const [sendOffBeforeNextOn, setSendOffBeforeNextOn] = useState(!!data.sendOffBeforeNextOn);
  const [offDelayMs, setOffDelayMs] = useState<number | string>(data.offDelayMs ?? "");
  // Collapse only the advanced OFF emission configuration, not the BPM itself
  const [showOffSettings, setShowOffSettings] = useState<boolean>(false);

  const handleBpmChange = (newValue: number) => {
    if (!isNaN(newValue) && newValue >= 1 && newValue <= 20000) {
      setBpm(newValue);
    }
  };
  const handleOffDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    // Allow empty string to let user clear input
    if (v === '') {
      setOffDelayMs('');
      return;
    }
    // Accept numeric or numeric string with optional ms suffix
    const match = v.match(/^\d+(?:\.\d+)?/);
    if (match) {
      setOffDelayMs(match[0]);
    }
  };

  // Notify parent of BPM changes
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        bpm,
        isEmitting,
        sendOff,
        offDelayMs: offDelayMs === '' ? undefined : offDelayMs,
        sendOffBeforeNextOn
      });
    }
  }, [bpm, isEmitting, sendOff, offDelayMs, sendOffBeforeNextOn]);

  // ensure wrapper style exists so color can be set externally via data.style.color
  const baseStyle = (data as any).style || {} as React.CSSProperties;
  const wrapperStyle: React.CSSProperties = {
    ...baseStyle,
    position: 'relative'
  };
  return (
    <div
      style={wrapperStyle}
    >
      <button
        style={{
          position:'absolute',
          top:3,
          right:3,
          width:19,
          height:19,
          padding:0,
          fontSize:12,
          background:isEmitting?'#0b0':'#900',
          color:'#fff',
          border:'1px solid #222',
          borderRadius:11,
          cursor:'pointer'
        }}
        onClick={() => setIsEmitting(v => !v)}
      >
        ⏻
      </button>
      {/* Removed headline per user request */}
      <div style={{display:'flex', flexDirection:'column', gap:4}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', fontSize:12}}>
          <span style={{marginBottom:5}}>BPM</span>
          <CustomNumberInput style={(baseStyle as any)} value={bpm} min={1} max={20000} step={1} onChange={handleBpmChange} />
        </div>
  <div style={{marginTop:4}}>
          <div style={{display:'flex', alignItems:'center', cursor:'pointer', fontSize:12, gap:4}} onClick={()=>setShowOffSettings(s=>!s)}>
            <span style={{display:'inline-block', transform: showOffSettings ? 'rotate(90deg)' : 'rotate(0deg)', transition:'transform 120ms ease'}}>▶</span>
            <span>OFF events</span>
          </div>
          {showOffSettings && (
            <div style={{display:'flex', flexDirection:'column', gap:4, marginTop:4}}>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}>
                <input type="checkbox" checked={sendOff} onChange={(e)=>setSendOff(e.target.checked)} /> send OFF
              </label>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, opacity: sendOff ? 1 : 0.4}}>
                <input type="checkbox" disabled={!sendOff} checked={sendOffBeforeNextOn} onChange={(e)=>setSendOffBeforeNextOn(e.target.checked)} /> OFF before next ON
              </label>
              <label style={{display:'flex', flexDirection:'column', fontSize:12, opacity: sendOff ? 1 : 0.4}}>OFF delay ms ({sendOffBeforeNextOn ? 'before next ON' : 'after ON'}):
                <input
                  style={{background:(baseStyle as any).background || '#333', color:(baseStyle as any).color || '#eee', border:'1px solid #555', padding:'2px 4px', borderRadius:3}}
                  type="text"
                  disabled={!sendOff}
                  value={offDelayMs}
                  placeholder={sendOffBeforeNextOn ? 'default 10' : 'default 50'}
                  onChange={handleOffDelayChange}
                />
              </label>
            </div>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="main-input" />
      <Handle type="source" position={Position.Right} id="main-output" />
    </div>
  );
};

export default React.memo(ClockFlowNode);