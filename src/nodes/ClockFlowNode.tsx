import React, { useEffect, useState, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { Power, ChevronRight } from "lucide-react";
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
      if (suppressBpmOnChangeRef.current) {
        suppressBpmOnChangeRef.current = false;
        return;
      }
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

  // Subscribe to virtual node param updates so the BPM display reflects
  // external changes (e.g. incoming MIDI tempo events on the bpm-input handle).
  const suppressBpmOnChangeRef = useRef(false);
  const eventBus = EventBus.getInstance();
  useEffect(() => {
    const nodeId = (data as any).id ?? id;
    if (!nodeId) return;
    const channel = `params.updateParams`;
    const handler = (p: any) => {
      // Only handle updates for this node
      if (p?.nodeid !== nodeId) return;
      const d = p?.data || p;
      if (typeof d?.bpm === 'number' && d.bpm !== bpm) {
        suppressBpmOnChangeRef.current = true;
        setBpm(d.bpm);
      }
    };
    eventBus.subscribe(channel, handler);
    return () => { eventBus.unsubscribe(channel, handler as any); };
  }, [id, data, bpm, eventBus]);

  // ensure wrapper style exists so color can be set externally via data.style.color
  const baseStyle = (data as any).style || {} as React.CSSProperties;
  const wrapperStyle: React.CSSProperties = {
    ...baseStyle,
    position: 'relative'
  };
  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.7,
    fontWeight: 600,
  };

  return (
    <div
      style={wrapperStyle}
    >
      <div style={{display:'flex', flexDirection:'column', gap:10, padding:'2px 0'}}>
        {/* ON/OFF pill */}
        <div style={{display:'flex', justifyContent:'center'}}>
          <button
            className={`nodrag nowheel nopan ${isEmitting ? 'node-state-btn-on' : 'node-state-btn-off'}`}
            draggable={false}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={() => setIsEmitting(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 14px',
              minWidth: 84,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              borderRadius: 999,
            }}
            title='Toggle clock on/off'
          >
            <Power size={13} strokeWidth={2.5} />
            <span>{isEmitting ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* BPM */}
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
          <span style={sectionLabelStyle}>BPM</span>
          <CustomNumberInput value={bpm} min={1} max={20000} step={1} onChange={handleBpmChange} />
        </div>

        {/* OFF events */}
        <div style={{
          borderTop: '1px solid color-mix(in srgb, var(--node-accent, #555) 25%, transparent)',
          paddingTop: 8,
        }}>
          <div
            style={{display:'flex', alignItems:'center', cursor:'pointer', gap:4, userSelect:'none'}}
            onClick={()=>setShowOffSettings(s=>!s)}
          >
            <ChevronRight
              size={12}
              style={{
                transform: showOffSettings ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 120ms ease',
                opacity: 0.7,
              }}
            />
            <span style={sectionLabelStyle}>OFF events</span>
          </div>
          {showOffSettings && (
            <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:8, paddingLeft:4}}>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, cursor:'pointer'}}>
                <input type="checkbox" checked={sendOff} onChange={(e)=>setSendOff(e.target.checked)} />
                <span>send OFF</span>
              </label>
              <label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, opacity: sendOff ? 1 : 0.4, cursor: sendOff ? 'pointer' : 'default'}}>
                <input type="checkbox" disabled={!sendOff} checked={sendOffBeforeNextOn} onChange={(e)=>setSendOffBeforeNextOn(e.target.checked)} />
                <span>OFF before next ON</span>
              </label>
              <label style={{display:'flex', flexDirection:'column', fontSize:11, opacity: sendOff ? 1 : 0.4, gap:3}}>
                <span style={{opacity:0.85}}>delay ms ({sendOffBeforeNextOn ? 'before next ON' : 'after ON'})</span>
                <input
                  type="text"
                  disabled={!sendOff}
                  value={offDelayMs}
                  placeholder={sendOffBeforeNextOn ? 'default 10' : 'default 50'}
                  onChange={handleOffDelayChange}
                  style={{padding:'3px 6px', fontSize:11, textAlign:'center'}}
                />
              </label>
            </div>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: '35%' }} title="Toggle On/Off" />
      <Handle type="target" position={Position.Left} id="bpm-input" style={{ top: '65%', background: '#f80' }} title="BPM Input" />
      <Handle type="source" position={Position.Right} id="main-output" />
    </div>
  );
};

export default React.memo(ClockFlowNode);