import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Handle,
  Position,
  useNodeId,
} from "@xyflow/react";
import EventBus from "../sys/EventBus";
import MidiKnob from "../components/MidiKnob";
import "./AudioNode.css";

type OscilloscopePayload = {
  wave: number[];
  fftSize: number;
  timestamp: number;
};

type OscilloscopeFlowNodeProps = {
  data: {
    id: string;
    label?: string;
    fftSize?: number;
    lineWidth?: number;
    triggerLevel?: number;
    glowIntensity?: number;
    zoom?: number;
    zoomX?: number;
    zoomY?: number;
    panOffset?: number;
    panY?: number;
    timeScale?: number;
    fps?: number;
    waveColor?: string;
    style?: React.CSSProperties;
    onChange?: (data: Record<string, any>) => void;
  };
};

const defaultStyle: React.CSSProperties = {
  width: "420px",
  padding: "15px",
  border: "1px solid #444",
  borderRadius: "5px",
  background: "#1f1f1f",
  color: "#eee",
  textAlign: "center",
};

const OscilloscopeFlowNode: React.FC<OscilloscopeFlowNodeProps> = ({
  data,
}) => {
  const bus = EventBus.getInstance();
  const reactFlowNodeId = useNodeId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<Float32Array>(new Float32Array(2048));
  const nodeId = data.id || reactFlowNodeId || "";
  const { onChange, style } = data;

  const [label, setLabel] = useState(data.label || "Scope");
  const [fftSize, setFftSize] = useState(data.fftSize || 4096);
  const [lineWidth, setLineWidth] = useState(data.lineWidth || 2);
  const [triggerLevel, setTriggerLevel] = useState(data.triggerLevel ?? 0.0);
  const [glowIntensity, setGlowIntensity] = useState(data.glowIntensity ?? 8);
  const [zoom, setZoom] = useState(data.zoom ?? 1.0);
  const [zoomX, setZoomX] = useState(data.zoomX ?? 20);
  const [zoomY, setZoomY] = useState(data.zoomY ?? 1.0);
  const [panOffset, setPanOffset] = useState(data.panOffset ?? 0.0);
  const [panY, setPanY] = useState(data.panY ?? 0.0);
  const [timeScale, setTimeScale] = useState(data.timeScale ?? 1.0);
  const [fps, setFps] = useState(data.fps ?? 15);
  const [waveColor, setWaveColor] = useState(data.waveColor ?? "#00ff00");

  // For frame rate limiting
  const lastDrawTime = useRef(0);

  // For mouse dragging to pan
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);

  // Notify parent of data changes
  useEffect(() => {
    onChange?.({
      label,
      fftSize,
      lineWidth,
      triggerLevel,
      glowIntensity,
      zoom,
      zoomX,
      zoomY,
      panOffset,
      panY,
      timeScale,
      fps,
      waveColor,
    });
  }, [onChange, label, fftSize, lineWidth, triggerLevel, glowIntensity, zoom, zoomX, zoomY, panOffset, panY, timeScale, fps, waveColor]);

  // Clamp pan offset when zoom changes
  useEffect(() => {
    const maxPan = Math.max(0, (zoomX - 1) / zoomX);
    if (panOffset > maxPan) {
      setPanOffset(maxPan);
    }
  }, [zoomX, panOffset]);

  // Subscribe to analyzer data
  useEffect(() => {
    if (!nodeId) return;
    const key = `${nodeId}.GUI.analyser.data`;
    const handler = (payload: OscilloscopePayload) => {
      // Convert to Float32Array normalized -1 to 1
      const raw = payload.wave;
      const arr = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        arr[i] = (raw[i] - 128) / 128; // Convert from byte (0-255) to -1..1
      }
      waveRef.current = arr;
      if (payload.fftSize && payload.fftSize !== fftSize) {
        setFftSize(payload.fftSize);
      }
    };
    bus.subscribe(key, handler);
    return () => {
      bus.unsubscribe(key, handler);
    };
  }, [bus, nodeId, fftSize]);

  // Drawing loop with stable triggering and phosphor effect
  useEffect(() => {
    let frame = 0;
    const frameInterval = 1000 / fps;
    
    const draw = (timestamp: number) => {
      frame = requestAnimationFrame(draw);
      
      // Skip frame if not enough time has passed
      const elapsed = timestamp - lastDrawTime.current;
      if (elapsed < frameInterval) return;
      lastDrawTime.current = timestamp - (elapsed % frameInterval);
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      // Clear to black
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // Always use live buffer
      const buffer = waveRef.current;
      if (!buffer || !buffer.length) return;

      const triggerIndex = findTriggerPoint(buffer, triggerLevel);
      drawWaveform(ctx, buffer, w, h, triggerIndex);
    };

    const drawGraticule = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.strokeStyle = "#222222";
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= 8; i++) {
        const x = (w / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      
      for (let i = 0; i <= 6; i++) {
        const y = (h / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Center lines
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    };

    const findTriggerPoint = (buffer: Float32Array, level: number): number => {
      const len = buffer.length;
      const searchStart = Math.floor(len * 0.1);
      const searchEnd = Math.floor(len * 0.5);
      
      for (let i = searchStart; i < searchEnd; i++) {
        if (buffer[i] <= level && buffer[i + 1] > level) {
          const fraction = (level - buffer[i]) / (buffer[i + 1] - buffer[i]);
          return i + fraction;
        }
      }
      return 0;
    };

    const drawWaveform = (
      ctx: CanvasRenderingContext2D,
      buffer: Float32Array,
      w: number,
      h: number,
      triggerIndex: number
    ) => {
      const centerY = h / 2 + (panY * h / 2);
      const amplitude = h / 2 * 0.85 * zoomY;
      const baseSamplesPerPixel = (buffer.length / w) / timeScale;
      const samplesPerPixel = baseSamplesPerPixel / zoomX;
      const visibleSamples = w * samplesPerPixel;
      
      // Start from trigger point, then apply pan offset within visible range
      const availableSamples = buffer.length - triggerIndex - visibleSamples;
      const panSamples = Math.max(0, panOffset * availableSamples);
      const startIndex = Math.floor(triggerIndex + panSamples);

      // Outer glow layer (lightsaber style)
      ctx.shadowBlur = glowIntensity * 1.2;
      ctx.shadowColor = waveColor;
      ctx.strokeStyle = waveColor + "26"; // 15% opacity
      ctx.lineWidth = lineWidth + 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawWavePath(ctx, buffer, w, centerY, amplitude, samplesPerPixel, startIndex);

      // Mid glow layer
      ctx.shadowBlur = glowIntensity;
      ctx.shadowColor = waveColor;
      ctx.strokeStyle = waveColor + "40"; // 25% opacity
      ctx.lineWidth = lineWidth + 1;
      drawWavePath(ctx, buffer, w, centerY, amplitude, samplesPerPixel, startIndex);

      // Main bright line
      ctx.shadowBlur = glowIntensity * 0.6;
      ctx.shadowColor = waveColor;
      ctx.strokeStyle = waveColor;
      ctx.lineWidth = lineWidth * 0.8;
      drawWavePath(ctx, buffer, w, centerY, amplitude, samplesPerPixel, startIndex);

      // Bright white core (always white for shine)
      ctx.shadowBlur = 4;
      ctx.shadowColor = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(0.5, lineWidth * 0.2);
      drawWavePath(ctx, buffer, w, centerY, amplitude, samplesPerPixel, startIndex);
    };

    const drawWavePath = (
      ctx: CanvasRenderingContext2D,
      buffer: Float32Array,
      w: number,
      centerY: number,
      amplitude: number,
      samplesPerPixel: number,
      startIndex: number
    ) => {
      ctx.beginPath();
      let firstPoint = true;
      for (let x = 0; x < w; x++) {
        const sampleIndex = Math.floor(startIndex + x * samplesPerPixel);
        if (sampleIndex >= buffer.length || sampleIndex < 0) continue;
        const sample = buffer[sampleIndex] || 0;
        const y = centerY - sample * amplitude;
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [lineWidth, triggerLevel, glowIntensity, zoomX, zoomY, panOffset, panY, timeScale, fps, waveColor]);

  const panelStyle = useMemo(() => {
    return style || defaultStyle;
  }, [style]);

  // Mouse handlers for dragging to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      isDragging.current = true;
      lastMouseX.current = e.clientX;
      e.preventDefault();
    }
  }, [zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current && zoom > 1) {
      const dx = e.clientX - lastMouseX.current;
      const sensitivity = 0.002 / zoom;
      const newPan = Math.max(0, Math.min(1, panOffset - dx * sensitivity));
      setPanOffset(newPan);
      lastMouseX.current = e.clientX;
    }
  }, [zoom, panOffset]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    const newZoom = Math.max(1, Math.min(16, zoom + delta));
    setZoom(newZoom);
  }, [zoom]);

  // Stop propagation to prevent node dragging when interacting with controls
  const stopPropagation = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div style={panelStyle}>
      <div style={{ textAlign: "center", marginBottom: "5px" }}>
        <span><b>SCOPE</b></span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ width: '10px', height: '10px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Canvas - Square */}
      <div
        style={{
          position: "relative",
          borderRadius: "50%",
          overflow: "hidden",
          border: "2px solid #333",
          marginBottom: "5px",
          background: "#000000",
          cursor: zoomX > 1 ? "grab" : "default",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
          width: "380px",
          height: "380px",
          margin: "0 auto 5px auto",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={380}
          height={380}
          style={{
            width: "380px",
            height: "380px",
            display: "block",
            background: "#000000",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* Controls with MidiKnobs - All in one line */}
      <div className="nodrag" style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-start", flexWrap: "wrap", gap: "4px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Zoom X</span>
          <MidiKnob min={0} max={200} value={zoomX} onChange={setZoomX} label="ZoomX" />
          <span style={{ fontSize: "8px" }}>{Math.round(zoomX)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Zoom Y</span>
          <MidiKnob min={10} max={400} value={Math.round(zoomY * 100)} onChange={(v) => setZoomY(v / 100)} label="ZoomY" />
          <span style={{ fontSize: "8px" }}>{zoomY.toFixed(1)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Time</span>
          <MidiKnob min={25} max={400} value={Math.round(timeScale * 100)} onChange={(v) => setTimeScale(v / 100)} label="Time" />
          <span style={{ fontSize: "8px" }}>{timeScale.toFixed(1)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Pan X</span>
          <MidiKnob min={0} max={100} value={Math.round(panOffset * 100)} onChange={(v) => setPanOffset(v / 100)} label="PanX" />
          <span style={{ fontSize: "8px" }}>{Math.round(panOffset * 100)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Pan Y</span>
          <MidiKnob min={-100} max={100} value={Math.round(panY * 100)} onChange={(v) => setPanY(v / 100)} label="PanY" />
          <span style={{ fontSize: "8px" }}>{Math.round(panY * 100)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Trig</span>
          <MidiKnob min={-100} max={100} value={Math.round(triggerLevel * 100)} onChange={(v) => setTriggerLevel(v / 100)} label="Trig" />
          <span style={{ fontSize: "8px" }}>{Math.round(triggerLevel * 100)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>FPS</span>
          <MidiKnob min={1} max={600} value={Math.round(fps * 10)} onChange={(v) => setFps(v / 10)} label="FPS" />
          <span style={{ fontSize: "8px" }}>{fps.toFixed(1)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: "9px" }}>Color</span>
          <input
            className="nodrag"
            type="color"
            value={waveColor}
            onChange={(e) => setWaveColor(e.target.value)}
            onMouseDown={stopPropagation}
            onPointerDown={stopPropagation}
            style={{ width: "40px", height: "40px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "4px" }}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(OscilloscopeFlowNode);
