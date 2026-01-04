import React, { useRef, useEffect, useState } from "react";

type Marker = {
  id: string;
  position: number;
  label: string;
};

type Sample = {
  id: string;
  name: string;
  start: number;
  end: number;
};

type TimelineNodeProps = {
  data: {
    id: string;
    samples?: Sample[];
    markers?: Marker[];
    onChange?: (data: any) => void;
  };
};

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 100;
const TIMELINE_LENGTH = 100; // Arbitrary timeline length for scaling

const TimelineNode: React.FC<TimelineNodeProps> = ({ data }) => {
  const [samples, setSamples] = useState<Sample[]>(data.samples || []);
  const [markers, setMarkers] = useState<Marker[]>(data.markers || []);
  const [sampleName, setSampleName] = useState("");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerPosition, setMarkerPosition] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw timeline, samples, and markers
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw timeline base
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH - 20, CANVAS_HEIGHT / 2);
    ctx.stroke();

    // Draw samples as colored bars
    samples.forEach((sample, i) => {
      const x1 = 20 + ((sample.start / TIMELINE_LENGTH) * (CANVAS_WIDTH - 40));
      const x2 = 20 + ((sample.end / TIMELINE_LENGTH) * (CANVAS_WIDTH - 40));
      ctx.fillStyle = "#4af";
      ctx.fillRect(x1, CANVAS_HEIGHT / 2 - 16 + i * 8, x2 - x1, 8);
      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.fillText(sample.name, x1 + 2, CANVAS_HEIGHT / 2 - 8 + i * 8);
    });

    // Draw markers as vertical lines
    markers.forEach((marker) => {
      const x = 20 + ((marker.position / TIMELINE_LENGTH) * (CANVAS_WIDTH - 40));
      ctx.strokeStyle = "#f44";
      ctx.beginPath();
      ctx.moveTo(x, CANVAS_HEIGHT / 2 - 24);
      ctx.lineTo(x, CANVAS_HEIGHT / 2 + 24);
      ctx.stroke();
      ctx.fillStyle = "#f44";
      ctx.font = "10px sans-serif";
      ctx.fillText(marker.label, x + 2, CANVAS_HEIGHT / 2 - 26);
    });
  }, [samples, markers]);

  // Add a new sample
  const addSample = () => {
    if (!sampleName) return;
    const newSample: Sample = {
      id: Date.now().toString(),
      name: sampleName,
      start: 0,
      end: 10,
    };
    const updatedSamples = [...samples, newSample];
    setSamples(updatedSamples);
    setSampleName("");
    data.onChange?.({ ...data, samples: updatedSamples, markers });
  };

  // Add a new marker
  const addMarker = () => {
    if (!markerLabel) return;
    const newMarker: Marker = {
      id: Date.now().toString(),
      position: markerPosition,
      label: markerLabel,
    };
    const updatedMarkers = [...markers, newMarker];
    setMarkers(updatedMarkers);
    setMarkerLabel("");
    setMarkerPosition(0);
    data.onChange?.({ ...data, samples, markers: updatedMarkers });
  };

  return (
    <div style={{ background: "#222", color: "#fff", padding: 16, borderRadius: 8, minWidth: 420 }}>
      <h3>Timeline Node</h3>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ background: "#111", borderRadius: 4, marginBottom: 16, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      />
      <div>
        <h4>Samples</h4>
        <ul>
          {samples.map((sample) => (
            <li key={sample.id}>
              {sample.name} ({sample.start} - {sample.end})
            </li>
          ))}
        </ul>
        <input
          type="text"
          placeholder="Sample name"
          value={sampleName}
          onChange={e => setSampleName(e.target.value)}
        />
        <button onClick={addSample} style={{ marginLeft: 8 }}>Add Sample</button>
      </div>
      <div style={{ marginTop: 16 }}>
        <h4>Markers</h4>
        <ul>
          {markers.map((marker) => (
            <li key={marker.id}>
              {marker.label} @ {marker.position}
            </li>
          ))}
        </ul>
        <input
          type="text"
          placeholder="Marker label"
          value={markerLabel}
          onChange={e => setMarkerLabel(e.target.value)}
        />
        <input
          type="number"
          placeholder="Position"
          value={markerPosition}
          onChange={e => setMarkerPosition(Number(e.target.value))}
          style={{ width: 60, marginLeft: 8 }}
        />
        <button onClick={addMarker} style={{ marginLeft: 8 }}>Add Marker</button>
      </div>
    </div>
  );
};

export default TimelineNode;