import React, { useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, useNodeId } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

export type VocoderFlowNodeProps = {
  data: {
    label?: string;
    bandCount: number;         // Number of frequency bands (8-32)
    lowFreq: number;           // Lowest band frequency (Hz)
    highFreq: number;          // Highest band frequency (Hz)
    attackTime: number;        // Envelope attack (ms)
    releaseTime: number;       // Envelope release (ms)
    qFactor: number;           // Q factor for bandpass filters
    carrierGain: number;       // Carrier input gain
    modulatorGain: number;     // Modulator input gain
    outputGain: number;        // Master output gain
    style?: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    // MIDI mappings
    bandCountMidiMapping?: MidiMapping | null;
    attackMidiMapping?: MidiMapping | null;
    releaseMidiMapping?: MidiMapping | null;
    qMidiMapping?: MidiMapping | null;
    carrierGainMidiMapping?: MidiMapping | null;
    modulatorGainMidiMapping?: MidiMapping | null;
    outputGainMidiMapping?: MidiMapping | null;
  };
};

// Presets for common vocoder sounds
const PRESETS = {
  classic: { bandCount: 20, lowFreq: 80, highFreq: 8000, attackTime: 3, releaseTime: 25, qFactor: 5 },
  robot: { bandCount: 24, lowFreq: 80, highFreq: 10000, attackTime: 2, releaseTime: 15, qFactor: 8 },
  speech: { bandCount: 32, lowFreq: 100, highFreq: 8000, attackTime: 2, releaseTime: 20, qFactor: 4 },
  daftpunk: { bandCount: 24, lowFreq: 80, highFreq: 12000, attackTime: 3, releaseTime: 20, qFactor: 10 },
  whisper: { bandCount: 32, lowFreq: 200, highFreq: 10000, attackTime: 8, releaseTime: 40, qFactor: 3 },
};

const defaultStyle: React.CSSProperties = {
  padding: "8px",
  border: "1px solid #3a2a5a",
  borderRadius: "8px",
  width: "200px",
  background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
  color: "#eee",
  boxShadow: "0 4px 15px rgba(100, 50, 200, 0.2)",
};

const VocoderFlowNode: React.FC<VocoderFlowNodeProps> = ({ data }) => {
  const bus = EventBus.getInstance();
  const reactFlowNodeId = useNodeId();
  const nodeId = data.id || reactFlowNodeId || 'vocoder';
  const flowId = data.flowId || 'default';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumRef = useRef<number[]>([]);

  // State for vocoder parameters
  const [label, setLabel] = useState(data.label || "Vocoder");
  const [bandCount, setBandCount] = useState(data.bandCount ?? 16);
  const [lowFreq, setLowFreq] = useState(data.lowFreq ?? 100);
  const [highFreq, setHighFreq] = useState(data.highFreq ?? 8000);
  const [attackTime, setAttackTime] = useState(data.attackTime ?? 5);
  const [releaseTime, setReleaseTime] = useState(data.releaseTime ?? 20);
  const [qFactor, setQFactor] = useState(data.qFactor ?? 8);
  const [carrierGain, setCarrierGain] = useState(data.carrierGain ?? 1);
  const [modulatorGain, setModulatorGain] = useState(data.modulatorGain ?? 1);
  const [outputGain, setOutputGain] = useState(data.outputGain ?? 1);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");

  // MIDI mapping states
  const [bandCountMidiMapping, setBandCountMidiMapping] = useState<MidiMapping | null>(null);
  const [attackMidiMapping, setAttackMidiMapping] = useState<MidiMapping | null>(null);
  const [releaseMidiMapping, setReleaseMidiMapping] = useState<MidiMapping | null>(null);
  const [qMidiMapping, setQMidiMapping] = useState<MidiMapping | null>(null);
  const [carrierGainMidiMapping, setCarrierGainMidiMapping] = useState<MidiMapping | null>(null);
  const [modulatorGainMidiMapping, setModulatorGainMidiMapping] = useState<MidiMapping | null>(null);
  const [outputGainMidiMapping, setOutputGainMidiMapping] = useState<MidiMapping | null>(null);

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Send parameter changes to the virtual node
  useEffect(() => {
    if (!nodeId) return;
    bus.emit(`${nodeId}.vocoder.setParams`, {
      bandCount,
      lowFreq,
      highFreq,
      attackTime,
      releaseTime,
      qFactor,
      carrierGain,
      modulatorGain,
      outputGain,
    });
  }, [bus, nodeId, bandCount, lowFreq, highFreq, attackTime, releaseTime, qFactor, carrierGain, modulatorGain, outputGain]);

  // Notify parent of changes (for saving)
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        label,
        bandCount,
        lowFreq,
        highFreq,
        attackTime,
        releaseTime,
        qFactor,
        carrierGain,
        modulatorGain,
        outputGain,
        bandCountMidiMapping,
        attackMidiMapping,
        releaseMidiMapping,
        qMidiMapping,
        carrierGainMidiMapping,
        modulatorGainMidiMapping,
        outputGainMidiMapping,
      });
    }
  }, [
    label, bandCount, lowFreq, highFreq, attackTime, releaseTime,
    qFactor, carrierGain, modulatorGain, outputGain,
    bandCountMidiMapping, attackMidiMapping, releaseMidiMapping,
    qMidiMapping, carrierGainMidiMapping, modulatorGainMidiMapping, outputGainMidiMapping
  ]);

  // Subscribe to spectrum data from virtual node
  useEffect(() => {
    if (!nodeId) return;
    const key = `${nodeId}.vocoder.spectrum`;
    const handler = (payload: { bands: number[] }) => {
      if (payload.bands) {
        spectrumRef.current = payload.bands;
      }
    };
    bus.subscribe(key, handler);
    return () => bus.unsubscribe(key, handler);
  }, [bus, nodeId]);

  // Canvas visualization of band levels
  useEffect(() => {
    let frameId = 0;
    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#0a0a15';
      ctx.fillRect(0, 0, w, h);

      const bands = spectrumRef.current;
      if (!bands.length) return;

      const barWidth = w / bands.length - 1;
      bands.forEach((level, i) => {
        const x = i * (barWidth + 1);
        const barHeight = Math.min(h, level * h);
        // Gradient from purple to cyan
        const hue = 270 - (i / bands.length) * 90;
        ctx.fillStyle = `hsl(${hue}, 70%, ${40 + level * 30}%)`;
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);
      });
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Apply preset
  const applyPreset = useCallback((presetName: string) => {
    const preset = PRESETS[presetName as keyof typeof PRESETS];
    if (preset) {
      setBandCount(preset.bandCount);
      setLowFreq(preset.lowFreq);
      setHighFreq(preset.highFreq);
      setAttackTime(preset.attackTime);
      setReleaseTime(preset.releaseTime);
      setQFactor(preset.qFactor);
      setSelectedPreset(presetName);
    }
  }, []);

  const style = data.style || defaultStyle;

  return (
    <div style={style}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "6px",
        borderBottom: "1px solid #3a3a5a",
        paddingBottom: "4px"
      }}>
        <span style={{ fontWeight: "bold", fontSize: "11px", color: "#b388ff" }}>🎤 VOCODER</span>
        <select
          value={selectedPreset}
          onChange={(e) => applyPreset(e.target.value)}
          style={{
            width: 70,
            background: '#1a1a2e',
            color: '#b388ff',
            border: '1px solid #3a3a5a',
            borderRadius: 4,
            padding: '1px 3px',
            fontSize: 9,
          }}
        >
          <option value="custom">Custom</option>
          {Object.keys(PRESETS).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Carrier Input (synth) */}
      <Handle
        type="target"
        position={Position.Left}
        id="carrier"
        style={{ top: 25, width: '10px', height: '10px', background: '#7c4dff' }}
        title="Carrier (Synth)"
      />
      <div style={{ position: 'absolute', left: 14, top: 20, fontSize: 8, color: '#7c4dff' }}>Carrier</div>

      {/* Modulator Input (voice) */}
      <Handle
        type="target"
        position={Position.Left}
        id="modulator"
        style={{ top: 50, width: '10px', height: '10px', background: '#00e5ff' }}
        title="Modulator (Voice)"
      />
      <div style={{ position: 'absolute', left: 14, top: 45, fontSize: 8, color: '#00e5ff' }}>Modulator</div>

      {/* Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
        style={{ background: '#b388ff' }}
      />

      {/* Spectrum Visualization */}
      <canvas
        ref={canvasRef}
        width={180}
        height={40}
        style={{
          width: '100%',
          height: '40px',
          borderRadius: '4px',
          marginBottom: '6px',
          border: '1px solid #2a2a4a'
        }}
      />

      {/* Main Controls Row 1 - Bands & Q */}
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4, marginBottom: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9 }}>Bands</span>
          <MidiKnob
            min={4}
            max={32}
            value={bandCount}
            onChange={(v) => { setBandCount(Math.round(v)); setSelectedPreset("custom"); }}
            midiMapping={bandCountMidiMapping}
            onMidiLearnChange={setBandCountMidiMapping}
            midiSensitivity={0.3}
            label="Bands"
            persistKey={`vocoder:${flowId}:${nodeId}:bands`}
          />
          <span style={{ fontSize: 9, color: '#888' }}>{bandCount}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9 }}>Q</span>
          <MidiKnob
            min={1}
            max={20}
            value={qFactor}
            onChange={(v) => { setQFactor(v); setSelectedPreset("custom"); }}
            midiMapping={qMidiMapping}
            onMidiLearnChange={setQMidiMapping}
            midiSensitivity={0.5}
            label="Q"
            persistKey={`vocoder:${flowId}:${nodeId}:q`}
          />
          <span style={{ fontSize: 9, color: '#888' }}>{qFactor.toFixed(1)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9 }}>Output</span>
          <MidiKnob
            min={0}
            max={2}
            value={outputGain}
            onChange={setOutputGain}
            midiMapping={outputGainMidiMapping}
            onMidiLearnChange={setOutputGainMidiMapping}
            midiSensitivity={0.5}
            label="Output"
            persistKey={`vocoder:${flowId}:${nodeId}:output`}
          />
          <span style={{ fontSize: 9, color: '#888' }}>{(outputGain * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Main Controls Row 2 - Attack & Release */}
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4, marginBottom: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9 }}>Attack</span>
          <MidiKnob
            min={0.5}
            max={100}
            value={attackTime}
            onChange={(v) => { setAttackTime(v); setSelectedPreset("custom"); }}
            midiMapping={attackMidiMapping}
            onMidiLearnChange={setAttackMidiMapping}
            midiSensitivity={0.4}
            label="Attack"
            persistKey={`vocoder:${flowId}:${nodeId}:attack`}
          />
          <span style={{ fontSize: 9, color: '#888' }}>{attackTime.toFixed(1)}ms</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9 }}>Release</span>
          <MidiKnob
            min={1}
            max={200}
            value={releaseTime}
            onChange={(v) => { setReleaseTime(v); setSelectedPreset("custom"); }}
            midiMapping={releaseMidiMapping}
            onMidiLearnChange={setReleaseMidiMapping}
            midiSensitivity={0.4}
            label="Release"
            persistKey={`vocoder:${flowId}:${nodeId}:release`}
          />
          <span style={{ fontSize: 9, color: '#888' }}>{releaseTime.toFixed(1)}ms</span>
        </div>
      </div>

      {/* Advanced Toggle */}
      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          cursor: 'pointer',
          fontSize: 9,
          color: '#888',
          textAlign: 'center',
          padding: '2px',
          borderTop: '1px solid #2a2a4a',
          marginTop: '4px'
        }}
      >
        {showAdvanced ? '▼ Advanced' : '▶ Advanced'}
      </div>

      {/* Advanced Controls */}
      {showAdvanced && (
        <div style={{ marginTop: '4px', padding: '4px', background: '#0a0a15', borderRadius: '4px' }}>
          {/* Frequency Range */}
          <div style={{ display: "flex", justifyContent: "space-around", gap: 4, marginBottom: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 8 }}>Low Hz</span>
              <input
                type="number"
                value={lowFreq}
                onChange={(e) => { setLowFreq(Math.max(20, parseInt(e.target.value) || 100)); setSelectedPreset("custom"); }}
                style={{
                  width: 50,
                  background: '#1a1a2e',
                  color: '#eee',
                  border: '1px solid #3a3a5a',
                  borderRadius: 4,
                  padding: '2px',
                  fontSize: 9,
                  textAlign: 'center'
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 8 }}>High Hz</span>
              <input
                type="number"
                value={highFreq}
                onChange={(e) => { setHighFreq(Math.min(20000, parseInt(e.target.value) || 8000)); setSelectedPreset("custom"); }}
                style={{
                  width: 50,
                  background: '#1a1a2e',
                  color: '#eee',
                  border: '1px solid #3a3a5a',
                  borderRadius: 4,
                  padding: '2px',
                  fontSize: 9,
                  textAlign: 'center'
                }}
              />
            </div>
          </div>

          {/* Input Gains */}
          <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: '#7c4dff' }}>Carrier</span>
              <MidiKnob
                min={0}
                max={2}
                value={carrierGain}
                onChange={setCarrierGain}
                midiMapping={carrierGainMidiMapping}
                onMidiLearnChange={setCarrierGainMidiMapping}
                midiSensitivity={0.5}
                label="Carrier"
                persistKey={`vocoder:${flowId}:${nodeId}:carrierGain`}
              />
              <span style={{ fontSize: 8, color: '#888' }}>{(carrierGain * 100).toFixed(0)}%</span>
              <Handle
                type="target"
                position={Position.Left}
                id="carrierGain"
                style={{ top: 'auto', bottom: 80 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: '#00e5ff' }}>Modulator</span>
              <MidiKnob
                min={0}
                max={2}
                value={modulatorGain}
                onChange={setModulatorGain}
                midiMapping={modulatorGainMidiMapping}
                onMidiLearnChange={setModulatorGainMidiMapping}
                midiSensitivity={0.5}
                label="Modulator"
                persistKey={`vocoder:${flowId}:${nodeId}:modulatorGain`}
              />
              <span style={{ fontSize: 8, color: '#888' }}>{(modulatorGain * 100).toFixed(0)}%</span>
              <Handle
                type="target"
                position={Position.Left}
                id="modulatorGain"
                style={{ top: 'auto', bottom: 40 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(VocoderFlowNode);
