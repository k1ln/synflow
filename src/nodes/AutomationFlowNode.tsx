import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Knob } from 'react-rotary-knob-react19';
import EventBus from '../sys/EventBus';
import './AudioNode.css';
import MidiKnob from '../components/MidiKnob';

export type AutomationPoint = { x: number; y: number }; // x:0..1 time, y:0..1 vertical (0=top,1=bottom)

export type AutomationFlowNodeProps = {
  data: {
    id: string;
    label?: string;
    lengthSec?: number; // total automation length in seconds
    lengthMs?: number; // total automation length in milliseconds
    lengthUnit?: 's' | 'ms'; // unit for length display
    points?: AutomationPoint[]; // normalized [0..1] x and y
  // Percent range -1000..1000 (interpreted later as percent of target span)
  min?: number; // default 0
  max?: number; // default 100
    loop?: boolean;
    style: React.CSSProperties;
    onChange: (d: any) => void;
  }
}

// New fixed vertical meaning: 0 (top) = 200%, 0.5 (middle) = 100%, 1 (bottom) = 0%
// Default flat line at middle (100%) => y = 0.5
const DEFAULT_POINTS: AutomationPoint[] = [
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
];

const AutomationFlowNode: React.FC<AutomationFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [label] = useState(data.label || 'Automation');
  const [lengthUnit, setLengthUnit] = useState<'s' | 'ms'>(data.lengthUnit || 's');
  // Initialize from either lengthMs or lengthSec, converting to internal seconds representation
  const initialLengthSec = data.lengthMs ? data.lengthMs / 1000 : (typeof data.lengthSec === 'number' ? data.lengthSec : 2);
  const [lengthSec, setLengthSec] = useState<number>(initialLengthSec);
  // min/max percent inputs removed: mapping is fixed (0..200%) so keep but unused for compatibility
  const [minVal, setMinVal] = useState<number>(typeof data.min === 'number' ? data.min : 0);
  const [maxVal, setMaxVal] = useState<number>(typeof data.max === 'number' ? data.max : 200);
  const [loop, setLoop] = useState<boolean>(data.loop ?? true);
  const [points, setPoints] = useState<AutomationPoint[]>((data.points && data.points.length) ? data.points : DEFAULT_POINTS);
  // Keep a ref with latest points so pointer event handlers (installed once) always see current data
  const pointsRef = useRef<AutomationPoint[]>(points);
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isMouseDownRef = useRef(false);
  const [activePercent, setActivePercent] = useState<number>(100); // shown in UI
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [nodeWidth, setNodeWidth] = useState<number>(() => {
    const w = (data as any).nodeWidth;
    if (typeof w === 'number' && w >= 260 && w <= 1000) return w;
    return 440; // previous default
  });

  // y=0 => maxVal, y=0.5 => mid, y=1 => minVal
  const yToPercent = (y:number)=> {
    const span = maxVal - minVal;
    return maxVal - (y * span);
  };

  const percentToY = (p:number)=> {
    const span = maxVal - minVal || 1;
    return (maxVal - p)/span;
  };

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);
    // Only draw baseline at 0% (which corresponds to minVal if minVal==0; otherwise still mark 0%)
    const zeroY = Math.round(percentToY(0) * (h - 1));
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY);
    ctx.stroke();
    // labels (top = max, bottom = min, plus 0% marker near line)
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText(maxVal + '%', 2, 10);
    ctx.fillText('0%', 2, Math.max(10, zeroY - 2));
    ctx.fillText(minVal + '%', 2, h - 4);
    // curve
    const pts = points.slice().sort((a,b)=>a.x-b.x);
    ctx.strokeStyle = '#0cf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p,i)=>{
      const px = Math.round(p.x * (w-1));
      const py = Math.round(p.y * (h-1));
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    });
    ctx.stroke();
    pts.forEach((p,i)=>{
      const px = Math.round(p.x * (w-1));
      const py = Math.round(p.y * (h-1));
      const isSelected = i === selectedPointIndex;
      ctx.beginPath();
      const radius = isSelected ? 8 : 6; // enlarged dots
      ctx.fillStyle = isSelected ? '#ffcc00' : '#fff';
      ctx.strokeStyle = isSelected ? '#ff9900' : '#222';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.arc(px,py, radius, 0, Math.PI*2);
      ctx.fill();
      if (isSelected) ctx.stroke();
    });
  };

  useEffect(()=>{ draw(); }, [points, style, lengthSec, loop, selectedPointIndex, minVal, maxVal, nodeWidth]);
  // When range changes, recompute active percent (if a point is selected) and redraw
  useEffect(()=>{
    if (selectedPointIndex != null && points[selectedPointIndex]) {
      setActivePercent(Math.round(yToPercent(points[selectedPointIndex].y)));
    }
    draw();
  }, [minVal, maxVal]);
  useEffect(()=>{
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, label, lengthSec, lengthMs: lengthSec * 1000, lengthUnit, points, min: minVal, max: maxVal, loop, style, nodeWidth });
    }
  }, [lengthSec, lengthUnit, points, loop, style, minVal, maxVal, nodeWidth]);

  const clampPercent = (v:number)=> Math.max(-1000, Math.min(1000, v));

  // Keep ref in sync for handlers
  useEffect(()=>{ pointsRef.current = points; draw(); }, [points, style]);

  // Pointer interaction handlers (install once)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isMouseDownRef.current = true;
      (canvas.closest('[data-id]') as HTMLElement | null)?.setAttribute('data-block-drag','true');
      const rect = canvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      const pts = pointsRef.current;
      // Pixel-based nearest search for better UX
      let nearest = -1; let best = Number.POSITIVE_INFINITY;
      const thresholdPx = 22; // increased hit threshold
      pts.forEach((p, i) => {
        const dxPx = (p.x - normX) * rect.width;
        const dyPx = (p.y - normY) * rect.height;
        const dist = Math.hypot(dxPx, dyPx);
        if (dist < best && dist <= thresholdPx) { nearest = i; best = dist; }
      });
      if (nearest >= 0) {
        dragIndexRef.current = nearest;
        setSelectedPointIndex(nearest);
        setActivePercent(Math.round(yToPercent(pts[nearest].y)));
      } else {
        const np = { x: Math.min(1, Math.max(0, normX)), y: Math.min(1, Math.max(0, normY)) };
        // Insert & sort, then select index of new point
        setPoints(prev => {
          const merged = [...prev, np].sort((a,b)=>a.x-b.x);
          const newIndex = merged.indexOf(np);
          dragIndexRef.current = newIndex;
          setSelectedPointIndex(newIndex);
          return merged;
        });
        setActivePercent(Math.round(yToPercent(np.y)));
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current || dragIndexRef.current == null) return;
      e.stopPropagation();
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      setPoints(prev => {
        const copy = prev.slice();
        if (dragIndexRef.current != null) {
          copy[dragIndexRef.current] = { x, y };
        }
        setActivePercent(Math.round(yToPercent(y)));
        return copy.sort((a,b)=>a.x-b.x);
      });
    };
    const stopDrag = () => {
      if (!isMouseDownRef.current) return;
      isMouseDownRef.current = false; dragIndexRef.current = null;
      (canvas.closest('[data-id]') as HTMLElement | null)?.removeAttribute('data-block-drag');
    };
    const onContext = (e: MouseEvent) => {
      // Right-click: remove nearest point (except first/last)
      if (e.button !== 2 && e.type !== 'contextmenu') return;
      e.preventDefault(); e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      const pts = pointsRef.current;
      if (pts.length <= 2) return; // keep endpoints at minimum
      let nearest = -1; let best = Number.POSITIVE_INFINITY; const thresholdPx = 16;
      pts.forEach((p, i) => {
        if (i === 0 || i === pts.length - 1) return; // don't remove endpoints
        const dxPx = (p.x - normX) * rect.width;
        const dyPx = (p.y - normY) * rect.height;
        const dist = Math.hypot(dxPx, dyPx);
        if (dist < best && dist <= thresholdPx) { nearest = i; best = dist; }
      });
      if (nearest >= 0) {
        setPoints(prev => prev.filter((_, i) => i !== nearest));
        setSelectedPointIndex(null);
      }
    };
    canvas.addEventListener('mousedown', onDown, { capture: true });
    canvas.addEventListener('contextmenu', onContext, { capture: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stopDrag);
    canvas.addEventListener('mouseleave', stopDrag);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stopDrag);
      canvas.removeEventListener('mouseleave', stopDrag);
    };
  }, []);

  const nodeStyle: React.CSSProperties = { ...(style ?? { padding: '6px 8px 8px 8px', border: '1px solid #2a3139', borderRadius: '5px', textAlign: 'center', background: '#1f1f1f', color: '#eee' }), width: nodeWidth + 'px' };

  const stopContextMenuBubble = (e: React.MouseEvent) => {
    // Allow canvas handler (point deletion) to run, but prevent outer flow from opening add-node palette
    e.stopPropagation();
  };

  return (
    <div style={nodeStyle} onContextMenu={stopContextMenuBubble}>
      <div className="audio-header" style={{marginBottom:4, display:'flex', alignItems:'center', gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <label style={{fontSize:11}}>Width</label>
          <input
            type="text"
            value={nodeWidth}
            onChange={(e)=>{
              const raw = e.target.value;
              const v = parseInt(raw, 10);
              if (Number.isNaN(v)) {
                setNodeWidth(260);
              } else {
                setNodeWidth(Math.min(2600, Math.max(260, v)));
              }
            }}
            onKeyDown={(e)=>{
              let delta = 0;
              if (e.key === 'ArrowUp') delta = 1;
              else if (e.key === 'ArrowDown') delta = -1;
              else if (e.key === 'ArrowRight') delta = 10;
              else if (e.key === 'ArrowLeft') delta = -10;
              if (delta !== 0) {
                e.preventDefault();
                setNodeWidth((v) => {
                  const nv = v + delta;
                  return Math.min(2600, Math.max(260, nv));
                });
              }
            }}
            style={{width:50, background:'#111', color:'#eee', border:'1px solid #333', fontSize:11, height:18, padding:'0 4px'}}
            title="Adjust node width (arrows: ±1, shift+arrows: ±10)"
          />
        </div>
        {selectedPointIndex != null && selectedPointIndex !== 0 && selectedPointIndex !== points.length - 1 && (
          <button
            title="Delete point"
            onClick={(e)=> { e.stopPropagation(); setPoints(ps => ps.filter((_,i)=> i!== selectedPointIndex)); setSelectedPointIndex(null); }}
            style={{
              marginLeft: 6,
              background: '#331111',
              color: '#ff8888',
              border: '1px solid #552222',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              padding: '1px 5px'
            }}
          >🗑</button>
        )}
      </div>

      <Handle type="target" position={Position.Left} id="main-input" style={{ width: '10px', height: '10px' }} />
     
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop:4 }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <label style={{fontSize:11, lineHeight:'14px'}}>
              Len {lengthUnit === 'ms' ? (lengthSec * 1000).toFixed(0) : lengthSec.toFixed(2)}{lengthUnit}
            </label>
            <button
              onClick={() => setLengthUnit(u => u === 's' ? 'ms' : 's')}
              style={{
                background: '#2a3a4a',
                color: '#aabbcc',
                border: '1px solid #445566',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 9,
                padding: '1px 4px',
                lineHeight: '12px'
              }}
              title="Toggle between seconds and milliseconds"
            >
              {lengthUnit === 's' ? 'ms' : 's'}
            </button>
          </div>
          <MidiKnob 
            style={{ display: 'inline-block' }} 
            min={lengthUnit === 'ms' ? 0 : 0.05} 
            max={lengthUnit === 'ms' ? 2000 : 30} 
            value={lengthUnit === 'ms' ? lengthSec * 1000 : lengthSec} 
            onChange={(v)=> {
              const newLengthSec = lengthUnit === 'ms' ? v / 1000 : v;
              setLengthSec(Math.max(0, Math.min(30, newLengthSec)));
            }} 
          />
        </div>
        <div style={{ display:'flex', flexDirection:'column', fontSize:11, gap:2 }}>
          <label style={{display:'flex',alignItems:'center',gap:4}}>Loop <input style={{margin:0}} type="checkbox" checked={loop} onChange={(e)=> setLoop(e.target.checked)} /></label>
          <label style={{lineHeight:'14px'}}>Active {activePercent.toFixed(0)}%</label>
          <label style={{display:'flex',gap:4,alignItems:'center', lineHeight:'14px'}}>Range
            <input
              type="text"
              value={minVal}
              onChange={(e)=>{
                const raw = e.target.value.trim();
                if (/^-?\d+$/.test(raw)) {
                  const v = parseInt(raw,10);
                  if(!Number.isNaN(v)) setMinVal(m=> Math.min(v, maxVal-1));
                }
              }}
              onKeyDown={(e)=>{
                let delta = 0;
                if (e.key === 'ArrowUp') delta = 1;
                else if (e.key === 'ArrowDown') delta = -1;
                else if (e.key === 'ArrowRight') delta = 10;
                else if (e.key === 'ArrowLeft') delta = -10;
                if (delta !== 0) {
                  e.preventDefault();
                  setMinVal(v=> {
                    const nv = Math.min(v + delta, maxVal - 1);
                    return Math.max(-1000, nv);
                  });
                }
              }}
              style={{width:48, background:'#111', color:'#eee', border:'1px solid #333', padding:'0 2px', height:18, fontSize:11}}
            />
            -
            <input
              type="text"
              value={maxVal}
              onChange={(e)=>{
                const raw = e.target.value.trim();
                if (/^-?\d+$/.test(raw)) {
                  const v = parseInt(raw,10);
                  if(!Number.isNaN(v)) setMaxVal(x=> Math.max(v, minVal+1));
                }
              }}
              onKeyDown={(e)=>{
                let delta = 0;
                if (e.key === 'ArrowUp') delta = 1;
                else if (e.key === 'ArrowDown') delta = -1;
                else if (e.key === 'ArrowRight') delta = 10;
                else if (e.key === 'ArrowLeft') delta = -10;
                if (delta !== 0) {
                  e.preventDefault();
                  setMaxVal(v=> {
                    const nv = Math.max(v + delta, minVal + 1);
                    return Math.min(1000, nv);
                  });
                }
              }}
              style={{width:48, background:'#111', color:'#eee', border:'1px solid #333', padding:'0 2px', height:18, fontSize:11}}
            />%
          </label>
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <canvas ref={canvasRef} width={Math.max(380, nodeWidth - 40)} height={130} style={{ borderRadius: 4, border: '1px solid #333', background: '#222', cursor:'crosshair', width:'100%' }} />
      </div>

      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />
    </div>
  );
};

export default AutomationFlowNode;
