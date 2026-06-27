import React, { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

type FrequencyType = "midi" | "hz" | "lfo";

export type AudioWorkletOscillatorFlowNodeProps = {
  data: {
    label: string;
    frequency: number;
    detune: number;
    type: OscillatorType;
    style: React.CSSProperties;
    frequencyType: FrequencyType;
    midiNode: string;
    knobValue: number;
    knobDetuneValue: number;
    id: string;
    flowId?: string;
    freqMidiMapping?: MidiMapping | null;
    detuneMidiMapping?: MidiMapping | null;
    onChange: (data: any) => void;
    syncConnected?: boolean;
  };
};

const oscillatorTypes = ["sine", "square", "sawtooth", "triangle", "custom"];

const AudioWorkletOscillatorFlowNode: React.FC<AudioWorkletOscillatorFlowNodeProps> = ({ data }) => {
  const [frequency, setFrequency] = useState(data.frequency || 440);
  const [detune, setDetune] = useState(data.detune || 0);
  const [label, setLabel] = useState(data.label || "AW Oscillator");
  const [waveform, setWaveform] = useState<OscillatorType>(data.type || "sine");
  const [oscFrequencyType, setOscFrequencyType] = useState<FrequencyType>(data.frequencyType);
  const [knobValue, setKnobValue] = useState(data.knobValue || 0);
  const [knobDetuneValue, setKnobDetuneValue] = useState(data.knobDetuneValue || 0);
  const [freqMidiMapping, setFreqMidiMapping] = useState<MidiMapping | null>(data.freqMidiMapping || null);
  const [detuneMidiMapping, setDetuneMidiMapping] = useState<MidiMapping | null>(data.detuneMidiMapping || null);
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  const eventBus = EventBus.getInstance();
  const isUserChangingKnob = useRef(false);

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, frequency, detune, label, type: waveform, frequencyType: oscFrequencyType, knobValue, freqMidiMapping, detuneMidiMapping });
    }
  }, [frequency, detune, label, waveform, oscFrequencyType, knobValue, style]);

  function changebackgroundColor(color: string) {
    setStyle({ ...style, background: color });
  }

  useEffect(() => {
    eventBus.subscribe(data.id + ".style.background", changebackgroundColor);
    return () => {
      eventBus.unsubscribe(data.id + ".style.background", changebackgroundColor);
    };
  });

  function changeValue(value: number) {
    isUserChangingKnob.current = true;
    setKnobValue(value);
    setFrequency(knobToFrequency(value));
  }

  function changeDetuneValue(value: number) {
    setKnobDetuneValue(value);
    setDetune(knobToFrequencyDetune(value));
  }

  function knobToFrequency(knobValue: number) {
    if (oscFrequencyType === "midi") {
      const midi = Math.round(knobValue);
      return 440 * Math.pow(2, (midi - 69) / 12);
    }
    if (oscFrequencyType === "hz") {
      const min = 20, max = 20000;
      return min * Math.pow(max / min, knobValue / 100);
    }
    if (oscFrequencyType === "lfo") {
      const min = 0.01, max = 250;
      const scaled = knobValue / 250;
      return min * Math.pow(max / min, Math.sqrt(scaled));
    }
    return 440;
  }

  function knobToFrequencyDetune(knobValue: number) {
    return knobValue / 100 * (frequency * 0.1);
  }

  // UI
  return (
    <div style={style}>
      <div style={{ textAlign: "center", marginBottom: 0 }}>
        <span><b>AW OSC</b></span>
      </div>
      {/* FM Input (for frequency modulation) */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 10, width: 10, height: 10, background: '#0af' }}
      />
      {/* Frequency Input (for flow event) */}
      <Handle
        type="target"
        position={Position.Left}
        id="frequency"
        style={{ top: 40, width: 10, height: 10, background: '#0f0' }}
      />
      {/* Sync Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="sync"
        style={{ top: 70, width: 10, height: 10, background: data.syncConnected ? '#0f0' : '#444' }}
      />
      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />
      {/* Frequency Knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span>Freq.</span>
        <MidiKnob
          min={oscFrequencyType === "midi" ? 24 : oscFrequencyType === "lfo" ? 0 : 0}
          max={oscFrequencyType === "midi" ? 96 : oscFrequencyType === "lfo" ? 250 : 100}
          value={knobValue}
          onChange={changeValue}
          midiMapping={freqMidiMapping}
          midiSmoothing={1}
          midiSensitivity={0.5}
          onMidiLearnChange={setFreqMidiMapping}
          label="Freq"
          persistKey={`awosc:${data.flowId || 'default'}:${data.id}:freq`}
        />
        <input
          type="text"
          value={frequency}
          onChange={e => setFrequency(parseFloat(e.target.value))}
          style={{ width: 50, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 3px', fontSize: 10, textAlign: 'center', marginBottom: 3 }}
        />
      </div>
      {/* Detune Knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span>Detune</span>
        <MidiKnob
          min={-100}
          max={100}
          value={knobDetuneValue}
          onChange={changeDetuneValue}
          midiMapping={detuneMidiMapping}
          onMidiLearnChange={setDetuneMidiMapping}
          label="Detune"
          persistKey={`awosc:${data.flowId || 'default'}:${data.id}:detune`}
        />
        <input
          type="text"
          value={detune}
          onChange={e => setDetune(parseFloat(e.target.value))}
          style={{ width: 50, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 3px', fontSize: 10, textAlign: 'center', marginBottom: 3 }}
        />
      </div>
      {/* Type Selector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <select
          value={waveform}
          onChange={e => setWaveform(e.target.value as OscillatorType)}
          style={{ width: 62, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 2px', fontSize: 9, textAlign: 'center' }}
        >
          {oscillatorTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {/* Frequency Type Selector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <select
          value={oscFrequencyType}
          onChange={e => setOscFrequencyType(e.target.value as FrequencyType)}
          style={{ width: 62, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 2px', fontSize: 9, textAlign: 'center' }}
        >
          {["midi", "hz", "lfo"].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default React.memo(AudioWorkletOscillatorFlowNode);
