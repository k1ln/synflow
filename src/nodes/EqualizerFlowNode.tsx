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
import "./AudioNode.css";

type EQBand = {
  id: number;
  frequency: number;
  gain: number;
  Q: number;
  type: BiquadFilterType;
};

type EQPayload = {
  freq: number[];
  wave: number[];
  response: number[];
  bands: EQBand[];
  timestamp: number;
};

export type EqualizerFlowNodeProps = {
  data: {
    id: string;
    label?: string;
    bands?: EQBand[];
    style?: React.CSSProperties;
    onChange?: (data: Record<string, unknown>) => void;
  };
};

const DEFAULT_BANDS: EQBand[] = [
  {
    id: 0,
    frequency: 60,
    gain: 0,
    Q: 1,
    type: "lowshelf",
  },
  {
    id: 1,
    frequency: 250,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 2,
    frequency: 1000,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 3,
    frequency: 4000,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 4,
    frequency: 12000,
    gain: 0,
    Q: 1,
    type: "highshelf",
  },
];

const defaultStyle: React.CSSProperties = {
  width: "340px",
  padding: "10px 12px",
  borderRadius: "14px",
  border: "1px solid #1d2233",
  background: "#05060d",
  color: "#f1f5ff",
  boxShadow: "0 14px 34px rgba(5,7,16,0.6)",
};

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_MIN = -24;
const GAIN_MAX = 24;

const freqToX = (
  freq: number,
  width: number,
) => {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  const logFreq = Math.log10(
    Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq)),
  );
  return ((logFreq - logMin) / (logMax - logMin)) * width;
};

const xToFreq = (
  x: number,
  width: number,
) => {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  const ratio = Math.max(0, Math.min(1, x / width));
  const logFreq = logMin + ratio * (logMax - logMin);
  return Math.pow(10, logFreq);
};

const gainToY = (
  gain: number,
  height: number,
) => {
  const ratio =
    1 - (gain - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
  return ratio * height;
};

const yToGain = (
  y: number,
  height: number,
) => {
  const ratio = Math.max(0, Math.min(1, y / height));
  return GAIN_MAX - ratio * (GAIN_MAX - GAIN_MIN);
};

const EqualizerFlowNode: React.FC<EqualizerFlowNodeProps> =
  ({ data }) => {
    const bus = EventBus.getInstance();
    const reactFlowNodeId = useNodeId();
    const canvasRef = useRef<HTMLCanvasElement | null>(
      null,
    );
    const freqRef = useRef<Uint8Array>(
      new Uint8Array(512),
    );
    const responseRef = useRef<Float32Array>(
      new Float32Array(512),
    );
    const nodeId = data.id || reactFlowNodeId || "";
    const { onChange, style } = data;

    const [label, setLabel] = useState(
      data.label || "Equalizer",
    );
    const [bands, setBands] = useState<EQBand[]>(
      data.bands?.length ? data.bands : DEFAULT_BANDS,
    );
    const [selectedBand, setSelectedBand] = useState<
      number | null
    >(null);
    const [dragging, setDragging] = useState(false);

    // Notify parent of state changes
    useEffect(() => {
      onChange?.({ label, bands });
    }, [onChange, label, bands]);

    // Subscribe to analyzer data from virtual node
    useEffect(() => {
      if (!nodeId) {
        return () => undefined;
      }
      const key = `${nodeId}.equalizer.data`;
      const handler = (payload: EQPayload) => {
        if (payload.freq) {
          freqRef.current = Uint8Array.from(payload.freq);
        }
        if (payload.response) {
          responseRef.current = Float32Array.from(
            payload.response,
          );
        }
      };
      bus.subscribe(key, handler);
      return () => {
        bus.unsubscribe(key, handler);
      };
    }, [bus, nodeId]);

    // Emit band changes to virtual node
    useEffect(() => {
      if (!nodeId) return;
      bus.emit(`${nodeId}.equalizer.setBands`, { bands });
    }, [bus, nodeId, bands]);

    // Canvas drawing loop
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
        const midY = h / 2;

        // Background gradient
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, w, h);

        // Draw grid lines
        ctx.strokeStyle = "rgba(80, 100, 140, 0.2)";
        ctx.lineWidth = 1;

        // Frequency grid (log scale)
        const freqMarkers = [
          50, 100, 200, 500, 1000,
          2000, 5000, 10000,
        ];
        freqMarkers.forEach((f) => {
          const x = freqToX(f, w);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        });

        // Gain grid
        const gainMarkers = [-18, -12, -6, 0, 6, 12, 18];
        gainMarkers.forEach((g) => {
          const y = gainToY(g, h);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        });

        // Zero dB line
        ctx.strokeStyle = "rgba(100, 120, 160, 0.5)";
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();

        // Draw frequency spectrum (input signal)
        const freqData = freqRef.current;
        if (freqData.length > 0) {
          ctx.fillStyle = "rgba(0, 200, 255, 0.15)";
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let i = 0; i < freqData.length; i++) {
            const ratio = i / freqData.length;
            const freq = FREQ_MIN * Math.pow(
              FREQ_MAX / FREQ_MIN,
              ratio,
            );
            const x = freqToX(freq, w);
            const val = freqData[i] / 255;
            const y = h - val * h;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();
        }

        // Draw EQ response curve
        const response = responseRef.current;
        if (response.length > 0) {
          ctx.strokeStyle = "rgba(255, 180, 50, 0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < response.length; i++) {
            const ratio = i / response.length;
            const freq = FREQ_MIN * Math.pow(
              FREQ_MAX / FREQ_MIN,
              ratio,
            );
            const x = freqToX(freq, w);
            // Response in dB, map to canvas
            const dB = response[i];
            const y = gainToY(dB, h);
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }

        // Draw band handles
        bands.forEach((band, idx) => {
          const x = freqToX(band.frequency, w);
          const y = gainToY(band.gain, h);
          const isSelected = selectedBand === idx;
          const radius = isSelected ? 10 : 8;

          // Band type color
          let color = "#4fc3f7";
          if (band.type === "lowshelf") {
            color = "#ff7043";
          }
          if (band.type === "highshelf") {
            color = "#ab47bc";
          }
          if (band.type === "lowpass") {
            color = "#66bb6a";
          }
          if (band.type === "highpass") {
            color = "#ef5350";
          }

          // Draw handle
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? "#fff" : color;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw frequency label
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          const freqLabel =
            band.frequency >= 1000
              ? `${(band.frequency / 1000).toFixed(1)}k`
              : `${Math.round(band.frequency)}`;
          ctx.fillText(freqLabel, x, y - 14);
        });
      };

      draw();
      return () => cancelAnimationFrame(frame);
    }, [bands, selectedBand]);

    // Handle mouse events on canvas
    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Find closest band
        let closest = -1;
        let minDist = 20;
        bands.forEach((band, idx) => {
          const bx = freqToX(band.frequency, canvas.width);
          const by = gainToY(band.gain, canvas.height);
          const dist = Math.sqrt(
            (x - bx) ** 2 + (y - by) ** 2,
          );
          if (dist < minDist) {
            minDist = dist;
            closest = idx;
          }
        });

        if (closest >= 0) {
          setSelectedBand(closest);
          setDragging(true);
        } else {
          setSelectedBand(null);
        }
      },
      [bands],
    );

    const handleCanvasMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!dragging || selectedBand === null) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const newFreq = xToFreq(x, canvas.width);
        const newGain = yToGain(y, canvas.height);

        setBands((prev) =>
          prev.map((b, idx) =>
            idx === selectedBand
              ? {
                ...b,
                frequency: Math.round(newFreq),
                gain: Math.round(newGain * 10) / 10,
              }
              : b,
          ),
        );
      },
      [dragging, selectedBand],
    );

    const handleCanvasMouseUp = useCallback(() => {
      setDragging(false);
    }, []);

    // Update band parameters from controls
    const updateBand = useCallback(
      (
        idx: number,
        key: keyof EQBand,
        value: number | string,
      ) => {
        setBands((prev) =>
          prev.map((b, i) =>
            i === idx ? { ...b, [key]: value } : b,
          ),
        );
      },
      [],
    );

    const panelStyle = useMemo(() => {
      return style || defaultStyle;
    }, [style]);

    const selected = selectedBand !== null
      ? bands[selectedBand]
      : null;

    return (
      <div style={panelStyle}>
        {/* Header */}
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
              fontSize: "11px",
              color: "#9db0ff",
            }}
          >
            5-Band EQ
          </span>
        </div>

        {/* Canvas */}
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
            width={300}
            height={150}
            style={{
              width: "100%",
              height: "150px",
              display: "block",
              cursor: dragging ? "grabbing" : "grab",
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        </div>

        {/* Band Controls */}
        {selected && selectedBand !== null && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
              marginBottom: "8px",
              padding: "6px",
              background: "#0a0d1a",
              borderRadius: "8px",
              border: "1px solid #1f2b46",
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "10px",
                color: "#9db0ff",
              }}
            >
              Frequency
              <input
                type="number"
                value={selected.frequency}
                min={20}
                max={20000}
                onChange={(e) =>
                  updateBand(
                    selectedBand,
                    "frequency",
                    parseInt(e.target.value, 10) || 100,
                  )
                }
                style={{
                  background: "#070a16",
                  border: "1px solid #1f2b46",
                  borderRadius: "6px",
                  padding: "3px 6px",
                  color: "#f4f6ff",
                  fontSize: "11px",
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "10px",
                color: "#9db0ff",
              }}
            >
              Gain (dB)
              <input
                type="number"
                value={selected.gain}
                min={-24}
                max={24}
                step={0.5}
                onChange={(e) =>
                  updateBand(
                    selectedBand,
                    "gain",
                    parseFloat(e.target.value) || 0,
                  )
                }
                style={{
                  background: "#070a16",
                  border: "1px solid #1f2b46",
                  borderRadius: "6px",
                  padding: "3px 6px",
                  color: "#f4f6ff",
                  fontSize: "11px",
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "10px",
                color: "#9db0ff",
              }}
            >
              Q Factor
              <input
                type="number"
                value={selected.Q}
                min={0.1}
                max={20}
                step={0.1}
                onChange={(e) =>
                  updateBand(
                    selectedBand,
                    "Q",
                    parseFloat(e.target.value) || 1,
                  )
                }
                style={{
                  background: "#070a16",
                  border: "1px solid #1f2b46",
                  borderRadius: "6px",
                  padding: "3px 6px",
                  color: "#f4f6ff",
                  fontSize: "11px",
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: "10px",
                color: "#9db0ff",
              }}
            >
              Type
              <select
                value={selected.type}
                onChange={(e) =>
                  updateBand(
                    selectedBand,
                    "type",
                    e.target.value,
                  )
                }
                style={{
                  background: "#070a16",
                  border: "1px solid #1f2b46",
                  borderRadius: "6px",
                  padding: "3px 6px",
                  color: "#f4f6ff",
                  fontSize: "11px",
                }}
              >
                <option value="lowshelf">Low Shelf</option>
                <option value="highshelf">High Shelf</option>
                <option value="peaking">Peaking</option>
                <option value="lowpass">Low Pass</option>
                <option value="highpass">High Pass</option>
                <option value="bandpass">Band Pass</option>
                <option value="notch">Notch</option>
              </select>
            </label>
          </div>
        )}

        {/* Band selection buttons */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            justifyContent: "center",
          }}
        >
          {bands.map((band, idx) => (
            <button
              key={band.id}
              onClick={() => setSelectedBand(idx)}
              style={{
                width: "50px",
                padding: "4px",
                fontSize: "10px",
                background:
                  selectedBand === idx
                    ? "#2563eb"
                    : "#0a0d1a",
                border: "1px solid #1f2b46",
                borderRadius: "6px",
                color: "#f4f6ff",
                cursor: "pointer",
              }}
            >
              {band.frequency >= 1000
                ? `${(band.frequency / 1000).toFixed(1)}k`
                : band.frequency}
            </button>
          ))}
        </div>

        {/* Handles */}
        <Handle
          type="target"
          position={Position.Left}
          id="main-input"
          style={{ top: "50%" }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ top: "50%" }}
        />
      </div>
    );
  };

export default React.memo(EqualizerFlowNode);
