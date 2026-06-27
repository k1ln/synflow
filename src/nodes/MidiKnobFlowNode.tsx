import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Knob } from 'react-rotary-knob-react19';
import EventBus from '../sys/EventBus';
import MidiKnob from '../components/MidiKnob';

export type CurveType = 'linear' | 'logarithmic' | 'exponential';
let render = 0;
export type MidiKnobMapping = {
  type: 'cc';
  channel: number; // 0-based
  number: number;  // controller number
} | null;

export type MidiKnobFlowNodeProps = {
  id: string;
  data: {
    label?: string;
    min?: number;
    max?: number;
    curve?: CurveType;
    value?: number;
    midiMapping?: MidiKnobMapping;
    controlsOpen?: boolean; // persisted open/closed state for advanced controls
    onChange?: (data: any) => void;
  };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const MidiKnobFlowNode: React.FC<MidiKnobFlowNodeProps> = ({ id, data }) => {
  const eventBus = useMemo(() => EventBus.getInstance(), []);

    // Defaults
  const [label, setLabel] = useState<string>(typeof data.label === 'string' ? data.label : '');
  const [min, setMin] = useState<number>(typeof data.min === 'number' ? data.min : 0);
  const [max, setMax] = useState<number>(typeof data.max === 'number' ? data.max : 1);
  // Local text states to allow freeform editing before commit
  const [minText, setMinText] = useState<string>(String(min));
  const [maxText, setMaxText] = useState<string>(String(max));
    const [curve, setCurve] = useState<CurveType>(data.curve || 'linear');
    const [value, setValue] = useState<number>(typeof data.value === 'number' ? data.value : 0);
    const [midiMapping, setMidiMapping] = useState<MidiKnobMapping>(data.midiMapping ?? null);
    const [controlsOpen, setControlsOpen] = useState<boolean>(data.controlsOpen ?? false);

    // Prevent infinite loops: only emit when local state changes actually differ from last emitted snapshot
    const lastEmittedRef = useRef<{label:string;min:number;max:number;curve:CurveType;value:number;midiMapping:MidiKnobMapping}|null>(null);
    const shallowChanged = (a: any, b: any) => {
      if (!a || !b) return true;
      for (const k of Object.keys(a)) {
        if (a[k] !== b[k]) return true;
      }
      return false;
    };
    useEffect(() => {
    const snapshot = { label, min, max, curve, value, midiMapping, controlsOpen };
      if (!lastEmittedRef.current || shallowChanged(snapshot, lastEmittedRef.current)) {
        const payload = { nodeid: id, data: snapshot };
        eventBus.emit(id + '.params.updateParams', payload);
        // Pass just the snapshot outward to avoid recreating full data object noise
        data.onChange?.(snapshot);
        lastEmittedRef.current = snapshot;
      }
    }, [label, min, max, curve, value, midiMapping, controlsOpen]);

    // Knob mapping helpers: normalized [0..1] to value and back
    const toValue = (t: number) => {
      t = clamp(t, 0, 1);
      const lo = min; const hi = max; const span = hi - lo;
      if (span === 0) return lo; // degenerate range
      switch (curve) {
        case 'linear':
          return lo + span * t;
        case 'exponential': {
          // emphasize low end; smooth exp in [0,1]
          const k = 3; // curvature factor
          return lo + span * Math.pow(t, k);
        }
        case 'logarithmic': {
          // Only valid for positive ranges; fallback to linear if invalid
          if (lo <= 0 || hi <= 0) return lo + span * t;
          const r = hi / lo; // ratio > 1
          return lo * Math.pow(r, t);
        }
        default:
          return lo + span * t;
      }
    };
    const fromValue = (v: number) => {
      const lo = min; const hi = max; const span = hi - lo;
      if (span <= 0) return 0;
      v = clamp(v, Math.min(lo, hi), Math.max(lo, hi));
      switch (curve) {
        case 'linear':
          return (v - lo) / span;
        case 'exponential': {
          const k = 3;
          const t = (v - lo) / span;
          return Math.pow(clamp(t, 0, 1), 1 / k);
        }
        case 'logarithmic': {
          if (lo <= 0 || hi <= 0) return (v - lo) / span; // fallback
          const r = hi / lo;
          return Math.log(v / lo) / Math.log(r);
        }
        default:
          return (v - lo) / span;
      }
    };

    // Derive knob range & current knob position
    // Use MIDI-like resolution for performance & predictability
    const knobMin = 0; const knobMax = 127;
    const knobVal = useMemo(() => fromValue(value) * (knobMax - knobMin) + knobMin, [value, min, max, curve]);

    const onKnobChange = useCallback((kv: number) => {
      const t = (kv - knobMin) / (knobMax - knobMin);
      const v = toValue(t);
      setValue(v);
    }, [knobMin, knobMax, toValue]);

    // MIDI learn UX: right-click to toggle learn
    const onContextMenu: React.MouseEventHandler<HTMLDivElement> = (e) => {
      e.preventDefault();
      eventBus.emit(id + '.updateParams.midiLearn', { midiLearn: true });
    };

  return (
    <div className="midi-knob-node" style={{ padding: 4, border: '1px solid #555', borderRadius: 6, background: '#333', color: '#eee', width: 70 }} onContextMenu={onContextMenu}>
        <div style={{ marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="text"
            placeholder="name"
            value={label}
            onChange={(e)=> setLabel(e.target.value)}
            style={{ width: 50, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 3px', fontSize: 10 }}
            title="Node name (right-click to MIDI learn)"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MidiKnob min={knobMin} max={knobMax} value={knobVal} onChange={onKnobChange} />
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {isFinite(value) ? value.toFixed(4) : '0.0000'}
          </div>
        {/* Caret toggle */}
        <div style={{ marginTop: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setControlsOpen(o => !o)}
            style={{
              background: '#222',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 9,
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title={controlsOpen ? 'Hide advanced controls' : 'Show advanced controls'}
          >
            <span style={{ display:'inline-block', transform: controlsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }}>▶</span>
            adv
          </button>
        </div>
        {controlsOpen && (
        <div style={{ display:'flex', flexDirection:'column', gap:2, marginTop:2 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
              <label style={{ fontSize: 10 }}>Min</label>
              <input
                type="text"
                inputMode="decimal"
                value={minText}
                onChange={(e)=> {
                  const raw = e.target.value;
                  // Allow '', '-', '.', '-.' during typing
                  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
                    setMinText(raw);
                    return;
                  }
                  // Basic filter: keep digits, optional leading '-', one '.'
                  let cleaned = raw.replace(/[^0-9+\-\.]/g, '');
                  // Ensure only first '-' and only at start
                  cleaned = cleaned.replace(/(?!^)-/g, '');
                  // Collapse multiple dots
                  const parts = cleaned.split('.');
                  if (parts.length > 2) {
                    cleaned = parts[0] + '.' + parts.slice(1).join('');
                  }
                  setMinText(cleaned);
                }}
                onBlur={()=> {
                  if (minText === '' || minText === '-' || minText === '.' || minText === '-.') {
                    // Revert to previous valid value
                    setMinText(String(min));
                    return;
                  }
                  const next = parseFloat(minText);
                  if (isFinite(next)) {
                    setMin(next);
                    setMinText(String(next));
                  } else {
                    setMinText(String(min));
                  }
                }}
                style={{ width:52, background:'#222', color:'#eee', border:'1px solid #444', borderRadius: 4, padding:'1px 2px', fontSize: 9 }}
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
              <label style={{ fontSize: 10 }}>Max</label>
              <input
                type="text"
                inputMode="decimal"
                value={maxText}
                onChange={(e)=> {
                  const raw = e.target.value;
                  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
                    setMaxText(raw);
                    return;
                  }
                  let cleaned = raw.replace(/[^0-9+\-\.]/g, '');
                  cleaned = cleaned.replace(/(?!^)-/g, '');
                  const parts = cleaned.split('.');
                  if (parts.length > 2) {
                    cleaned = parts[0] + '.' + parts.slice(1).join('');
                  }
                  setMaxText(cleaned);
                }}
                onBlur={()=> {
                  if (maxText === '' || maxText === '-' || maxText === '.' || maxText === '-.') {
                    setMaxText(String(max));
                    return;
                  }
                  const next = parseFloat(maxText);
                  if (isFinite(next)) {
                    setMax(next);
                    setMaxText(String(next));
                  } else {
                    setMaxText(String(max));
                  }
                }}
                style={{ width:52, background:'#222', color:'#eee', border:'1px solid #444', borderRadius: 4, padding:'1px 2px', fontSize: 9 }}
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
              <label style={{ fontSize: 10 }}>Curve</label>
              <select value={curve} onChange={(e)=> setCurve(e.target.value as CurveType)} style={{ width:62, background:'#222', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'1px 2px', fontSize: 9 }}>
                <option value="linear">linear</option>
                <option value="logarithmic">logarithmic</option>
                <option value="exponential">exponential</option>
              </select>
            </div>
          </div>
          )}
        </div>


  <Handle type="source" position={Position.Right} id="output" style={{ top: 18, width: 8, height: 8 }} />
    </div>
  );
};

export default MidiKnobFlowNode;
