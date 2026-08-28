import React, { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import { OptionSelect } from "../components/OptionSelect";
import { NumberField } from "../components/NumberField";
import { WAVEFORM_OPTIONS_CUSTOM } from "../components/nodeSymbols";
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
    // Knob travels -100..100; map straight to cents so the range is
    // frequency-independent and actually wide (±1200 cents = ±1 octave,
    // matching the worklet's detune param clamp).
    return knobValue * 12;
  }

  // UI
  return (
    <div className="flow-node" style={{ ...style, width: 'auto' }}>
      <div className="node-title">AW OSC</div>
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

      {/* Two-column control grid (Freq|Detune / Wave|Mode) */}
      <div className="osc-grid">
        {/* Frequency Knob */}
        <div className="node-field">
          <span className="node-label">Freq.</span>
          <MidiKnob
            accentColor="#4ade80"
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
          <NumberField
            value={frequency}
            onCommit={setFrequency}
            min={0}
            width={50}
          />
        </div>
        {/* Detune Knob */}
        <div className="node-field">
          <span className="node-label">Detune</span>
          <MidiKnob
            accentColor="#4ade80"
            min={-100}
            max={100}
            value={knobDetuneValue}
            onChange={changeDetuneValue}
            midiMapping={detuneMidiMapping}
            onMidiLearnChange={setDetuneMidiMapping}
            label="Detune"
            persistKey={`awosc:${data.flowId || 'default'}:${data.id}:detune`}
          />
          <NumberField
            value={detune}
            onCommit={setDetune}
            width={50}
          />
        </div>
        {/* Type Selector */}
        <div className="node-field">
          <span className="node-label">Wave</span>
          <OptionSelect
            value={waveform}
            onChange={(v) => setWaveform(v as OscillatorType)}
            options={WAVEFORM_OPTIONS_CUSTOM}
            columns={2}
            aria-label="Waveform"
          />
        </div>
        {/* Frequency Type Selector */}
        <div className="node-field">
          <span className="node-label">Mode</span>
          <OptionSelect
            value={oscFrequencyType}
            onChange={(v) => setOscFrequencyType(v as FrequencyType)}
            options={[
              { value: 'midi', label: 'MIDI' },
              { value: 'hz', label: 'Hz' },
              { value: 'lfo', label: 'LFO' },
            ]}
            aria-label="Frequency mode"
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  frequency: 440,
  detune: 0,
  type: "sine",
  frequencyType: "hz",
  label: "AW Oscillator",
  style: { width: "60px" },
};

export default React.memo(AudioWorkletOscillatorFlowNode);
