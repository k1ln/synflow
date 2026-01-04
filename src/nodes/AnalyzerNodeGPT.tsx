import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Handle,
  Position,
  useNodeId,
} from "@xyflow/react";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

type Mode = "bars" | "scope";
type Preset = "aurora" | "ember" | "mono";

type AnalyzerPayload = {
  freq: number[];
  wave: number[];
  fftSize: number;
  timestamp: number;
};

type AnalyzerNodeGPTProps = {
  data: {
    id: string;
    label?: string;
    mode?: Mode;
    fftSize?: number;
    minDecibels?: number;
    maxDecibels?: number;
    smoothingTimeConstant?: number;
    colorPreset?: Preset;
    style?: React.CSSProperties;
    onChange?: (data: Record<string, any>) => void;
  };
};

const COLOR_PRESETS: Record<Preset, string[]> = {
  aurora: ["#030b1f", "#1443ff", "#ff4dd8"],
  ember: ["#1b0500", "#f97316", "#ffd7a1"],
  mono: ["#040404", "#516bff", "#e3f2ff"],
};

const defaultStyle: React.CSSProperties = {
  width: "280px",
  padding: "10px 12px",
  borderRadius: "14px",
  border: "1px solid #1d2233",
  background: "#05060d",
  color: "#f1f5ff",
  boxShadow: "0 14px 34px rgba(5,7,16,0.6)",
};

const AnalyzerNodeGPT: React.FC<AnalyzerNodeGPTProps> = ({
  data,
}) => {
  const bus = EventBus.getInstance();
  const reactFlowNodeId = useNodeId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const freqRef = useRef<Uint8Array>(new Uint8Array(512));
  const waveRef = useRef<Uint8Array>(new Uint8Array(512));
  const peakRef = useRef(0);
  const nodeId = data.id || reactFlowNodeId || "";
  const { onChange, style } = data;
  const [label, setLabel] = useState(
    data.label || "Analyzer"
  );
  const [mode, setMode] = useState<Mode>(
    data.mode || "bars"
  );
  const [fftSize, setFftSize] = useState(
    data.fftSize || 1024
  );
  const [minDb, setMinDb] = useState(
    data.minDecibels || -96
  );
  const [maxDb, setMaxDb] = useState(
    data.maxDecibels || -10
  );
  const [smooth, setSmooth] = useState(
    data.smoothingTimeConstant ?? 0.8
  );
  const [colorPreset, setColorPreset] = useState<Preset>(
    data.colorPreset || "aurora"
  );
  const [peak, setPeak] = useState(0);

  useEffect(() => {
    onChange?.({
      label,
      mode,
      fftSize,
      minDecibels: minDb,
      maxDecibels: maxDb,
      smoothingTimeConstant: smooth,
      colorPreset,
    });
  }, [
    onChange,
    label,
    mode,
    fftSize,
    minDb,
    maxDb,
    smooth,
    colorPreset,
  ]);

  useEffect(() => {
    if (!nodeId) {
      return () => undefined;
    }
    const key = `${nodeId}.analyser.data`;
    const handler = (payload: AnalyzerPayload) => {
      freqRef.current = Uint8Array.from(payload.freq);
      waveRef.current = Uint8Array.from(payload.wave);
      peakRef.current = Math.max(...payload.freq) / 255;
      if (payload.fftSize && payload.fftSize !== fftSize) {
        setFftSize(payload.fftSize);
      }
    };
    bus.subscribe(key, handler);
    return () => {
      bus.unsubscribe(key, handler);
    };
  }, [bus, nodeId, fftSize]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPeak(peakRef.current);
    }, 180);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const colors = COLOR_PRESETS[colorPreset];
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(0.6, colors[1]);
      grad.addColorStop(1, colors[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      if (mode === "bars") {
        drawBars(ctx, w, h);
      } else {
        drawScope(ctx, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
    };
    const drawBars = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      const buffer = freqRef.current;
      if (!buffer.length) return;
      const cols = 52;
      const rows = 24;
      const gapX = 2;
      const gapY = 1.5;
      const usableH = h - 8;
      const ledH =
        (usableH - gapY * (rows - 1)) / rows;
      const colW = w / cols - gapX;
      const pickColor = (ratio: number) => {
        if (ratio > 0.9) return "#ff5555";
        if (ratio > 0.75) return "#ffa73c";
        if (ratio > 0.2) return "#00f79c";
        return "#1c4eff";
      };
      const step = Math.max(1, buffer.length / cols);
      for (let c = 0; c < cols; c++) {
        const idx = Math.floor(c * step);
        const ratio = buffer[idx] / 255;
        const lit = Math.round(ratio * rows);
        const x = c * (colW + gapX) + gapX * 0.5;
        for (let r = 0; r < rows; r++) {
          const y =
            h - 4 - (r + 1) * ledH - r * gapY;
          const level = r / rows;
          const on = r < lit;
          ctx.shadowBlur = on ? 5 : 0;
          ctx.shadowColor = on
            ? pickColor(level)
            : "transparent";
          ctx.fillStyle = on
            ? pickColor(level)
            : "rgba(10,15,26,0.35)";
          ctx.globalAlpha = on ? 0.95 : 0.18;
          ctx.fillRect(x, y, colW, ledH);
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };
    const drawScope = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      const buffer = waveRef.current;
      if (!buffer.length) return;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      const slice = buffer.length / w;
      for (let i = 0; i < w; i++) {
        const index = Math.floor(i * slice);
        const v = buffer[index] / 255;
        const y = v * h;
        const mapped = h - y;
        if (i === 0) {
          ctx.moveTo(0, mapped);
        } else {
          ctx.lineTo(i, mapped);
        }
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [mode, colorPreset]);

  const panelStyle = useMemo(() => {
    return style || defaultStyle;
  }, [style]);

  const peakText = useMemo(() => {
    return `${Math.round(peak * 100)}%`;
  }, [peak]);

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
          gap: "6px",
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{
            flex: 1,
            background: "#070a16",
            border: "1px solid #1f2b46",
            borderRadius: "8px",
            padding: "4px 8px",
            color: "#f4f6ff",
            fontSize: "12px",
          }}
        />
        <span
          style={{
            minWidth: "44px",
            textAlign: "right",
            fontSize: "12px",
            color: "#9db0ff",
          }}
        >
          {peakText}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid #11182b",
          marginBottom: "8px",
        }}
      >
        <canvas
          ref={canvasRef}
          width={240}
          height={120}
          style={{
            width: "100%",
            height: "120px",
            display: "block",
            background: "#030712",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 30% 20%, " +
              "rgba(255,255,255,0.35), transparent 55%)",
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: "6px",
          marginBottom: "8px",
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          style={{
            width: "100%",
            background: "#070a16",
            border: "1px solid #1f2b46",
            borderRadius: "8px",
            padding: "4px",
            color: "#f4f6ff",
            fontSize: "12px",
          }}
        >
          <option value="bars">Bars</option>
          <option value="scope">Scope</option>
        </select>
        <select
          value={colorPreset}
          onChange={(e) =>
            setColorPreset(e.target.value as Preset)
          }
          style={{
            width: "100%",
            background: "#070a16",
            border: "1px solid #1f2b46",
            borderRadius: "8px",
            padding: "4px",
            color: "#f4f6ff",
            fontSize: "12px",
          }}
        >
          <option value="aurora">Aurora</option>
          <option value="ember">Ember</option>
          <option value="mono">Mono</option>
        </select>
        <select
          value={fftSize}
          onChange={(e) =>
            setFftSize(parseInt(e.target.value, 10))
          }
          style={{
            width: "100%",
            background: "#070a16",
            border: "1px solid #1f2b46",
            borderRadius: "8px",
            padding: "4px",
            color: "#f4f6ff",
            fontSize: "12px",
          }}
        >
          {[256, 512, 1024, 2048, 4096].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "11px",
            color: "#9db0ff",
          }}
        >
          Smooth {smooth.toFixed(2)}
          <input
            type="range"
            min={0}
            max={0.98}
            step={0.02}
            value={smooth}
            onChange={(e) =>
              setSmooth(parseFloat(e.target.value))
            }
          />
        </label>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: "6px",
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "11px",
            color: "#9db0ff",
          }}
        >
          Min dB
          <input
            type="number"
            value={minDb}
            onChange={(e) =>
              setMinDb(parseInt(e.target.value, 10))
            }
            style={{
              background: "#070a16",
              border: "1px solid #1f2b46",
              borderRadius: "8px",
              padding: "4px",
              color: "#f4f6ff",
              fontSize: "12px",
            }}
          />
        </label>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "11px",
            color: "#9db0ff",
          }}
        >
          Max dB
          <input
            type="number"
            value={maxDb}
            onChange={(e) =>
              setMaxDb(parseInt(e.target.value, 10))
            }
            style={{
              background: "#070a16",
              border: "1px solid #1f2b46",
              borderRadius: "8px",
              padding: "4px",
              color: "#f4f6ff",
              fontSize: "12px",
            }}
          />
        </label>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: "55%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: "55%" }}
      />
    </div>
  );
};

export default React.memo(AnalyzerNodeGPT);