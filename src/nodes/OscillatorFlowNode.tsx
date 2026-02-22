import React, { use, useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";
type FrequencyType = "midi" | "hz" | "lfo";

export type OscillatorFlowNodeProps = {
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
    id:string;
    flowId?: string; // optional identifier for the overall flow/patch
    freqMidiMapping?: MidiMapping | null;
    detuneMidiMapping?: MidiMapping | null;
    pulseWidth?: number;
    periodicWaveHarmonics?: number;
    onChange: (data: any) => void;
  };
};

/**
 * Build a PeriodicWave for a pulse wave with a given duty cycle.
 * dutyCycle: 0..1 (0.5 = standard square wave)
 * numHarmonics: how many harmonics to include (more = sharper edges)
 */
export function buildPulsePeriodicWave(
  audioContext: AudioContext,
  dutyCycle: number = 0.5,
  numHarmonics: number = 128
): PeriodicWave {
  const real = new Float32Array(numHarmonics);
  const imag = new Float32Array(numHarmonics);

  real[0] = 2 * dutyCycle - 1; // DC offset
  imag[0] = 0;

  for (let n = 1; n < numHarmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
    imag[n] = 0;
  }

  return audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
}

const OscillatorFlowNode: React.FC<OscillatorFlowNodeProps> = ({ data }) => {
  const [frequency, setFrequency] = useState(data.frequency || 440);
  const [detune, setDetune] = useState(data.detune || 0);
  const [label, setLabel] = useState(data.label || "Oscillator");
  const [waveform, setWaveform] = useState<OscillatorType>(data.type || "sine");
  const [pulseWidth, setPulseWidth] = useState(data.pulseWidth ?? 0.5);
  const [periodicWaveHarmonics, setPeriodicWaveHarmonics] = useState(data.periodicWaveHarmonics ?? 128);
  
  // Calculate initial knobValue based on frequency and type, don't trust saved value
  const calculateInitialKnobValue = () => {
    const freq = data.frequency || 440;
    const type = data.frequencyType || "hz";
    
    if (type === "midi") {
      const knob = Math.round(69 + 12 * Math.log2(freq / 440));
      return Math.max(24, Math.min(96, knob)); // Clamp to MIDI range
    } else if (type === "hz") {
      const clampedFreq = Math.max(20, Math.min(20000, freq)); // Clamp frequency to Hz range
      const knob = Math.log10(clampedFreq / 20) / Math.log10(20000 / 20) * 100;
      return Math.max(0, Math.min(100, knob)); // Clamp knob to 0-100
    } else if (type === "lfo") {
      // Inverse of: scaledValueLinear = sqrt(knobValue / 250)
      //             lfoFrequency = 0.01 * (250 / 0.01) ^ scaledValueLinear
      const minLfoFrequency = 0.01;
      const maxLfoFrequency = 250;
      const clampedFreq = Math.max(minLfoFrequency, Math.min(maxLfoFrequency, freq));
      const ratio = Math.log(clampedFreq / minLfoFrequency) / Math.log(maxLfoFrequency / minLfoFrequency);
      const knobNormalized = Math.pow(ratio, 2); // Square because forward uses sqrt
      return Math.max(0, Math.min(250, knobNormalized * 250)); // Clamp to LFO range
    }
    return 0;
  };
  
  const [knobValue, setKnobValue] = useState(calculateInitialKnobValue());
  const [knobDetuneValue, setKnobDetuneValue] = useState(data.knobDetuneValue || 0);
  const [oscFrequencyType, setOscFrequencyType] = useState<FrequencyType>(data.frequencyType);
  const [midiNode, setMidiNode] = useState<string>(data.midiNode);
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  
  // Set initial min/max based on type
  const getInitialMinMax = () => {
    const type = data.frequencyType || "hz";
    if (type === "midi") return { min: 24, max: 96 };
    if (type === "lfo") return { min: 0, max: 250 };
    return { min: 0, max: 100 };
  };
  
  const initialMinMax = getInitialMinMax();
  const [knobMin, setKnobMin] = useState(initialMinMax.min);
  const [knobMax, setKnobMax] = useState(initialMinMax.max);
  const [freqMidiMapping, setFreqMidiMapping] = useState<MidiMapping | null>(data.freqMidiMapping || null);
  const [detuneMidiMapping, setDetuneMidiMapping] = useState<MidiMapping | null>(data.detuneMidiMapping || null);
  const isUserChangingKnob = React.useRef(false);
  const eventBus = EventBus.getInstance();
  //TODO Set Waveform here with createPeriodicWave at one point 
  function midiNoteToNoteName(midiNote: number): string {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(midiNote / 12) - 1;
    const note = noteNames[midiNote % 12];
    return `${note}${octave}`;
  }

  


  function knobToFrequency(knobValue: number) {
    let result: number;
    if (oscFrequencyType == "midi") {
      knobValue = Math.round(knobValue);
      const midiNote = midiNoteToNoteName(knobValue);
      setMidiNode(midiNote);
      let frequency = 440 * Math.pow(2, (knobValue - 69) / 12);
      frequency = Math.round(frequency * 1000) / 1000;
      result = frequency;
    } else if (oscFrequencyType == "lfo") {
      const minLfoFrequency = 0.01;
      const maxLfoFrequency = 250;
      const scaledValue = knobValue / 250;
      const scaledValueLinear = Math.pow(scaledValue, 0.5);
      const lfoFrequency = minLfoFrequency * Math.pow(maxLfoFrequency / minLfoFrequency, scaledValueLinear);
      result = Math.round(lfoFrequency * 1000) / 1000;
    } else {
      knobValue = Math.max(0, Math.min(100, knobValue));
      const minFrequency = 20;
      const maxFrequency = 20000;
      let frequency = minFrequency * Math.pow(maxFrequency / minFrequency, knobValue / 100);
      frequency = Math.round(frequency * 1000) / 1000;
      result = frequency;
    }
    return result;
  }

  function knobToFrequencyDetune(knobValue: number) {
    const knobFrequency = knobValue/knobMax * (frequency * 0.1);
    return knobFrequency;
  }


  useEffect(() => {
    // Skip recalculating knobValue if user is actively changing it
    if (isUserChangingKnob.current) {
      isUserChangingKnob.current = false;
      return;
    }
    
    beforeSetOscFrequencyType(oscFrequencyType);
    const initialKnobValue = (() => {
      if (oscFrequencyType === "midi") {
        const knob = Math.round(69 + 12 * Math.log2(frequency / 440));
        return Math.max(24, Math.min(96, knob)); // Clamp to MIDI range
      } else if (oscFrequencyType === "hz") {
        const clampedFreq = Math.max(20, Math.min(20000, frequency)); // Clamp frequency to Hz range
        const knob = Math.log10(clampedFreq / 20) / Math.log10(20000 / 20) * 100;
        return Math.max(0, Math.min(100, knob)); // Clamp knob to 0-100
      } else if (oscFrequencyType === "lfo") {
        // Inverse of the sqrt transformation used in knobToFrequency
        const minLfoFrequency = 0.01;
        const maxLfoFrequency = 250;
        const clampedFreq = Math.max(minLfoFrequency, Math.min(maxLfoFrequency, frequency));
        const ratio = Math.log(clampedFreq / minLfoFrequency) / Math.log(maxLfoFrequency / minLfoFrequency);
        const knobNormalized = Math.pow(ratio, 2); // Square because forward uses sqrt
        return Math.max(0, Math.min(250, knobNormalized * 250)); // Clamp to LFO range
      }
      return 0;
    })();
    setKnobValue(initialKnobValue);
  }, [oscFrequencyType, frequency,knobMax, knobMin]);

  useEffect(() => {
    // Perform an action whenever frequency changes
    if (data.onChange instanceof Function) {
      //console.log("Change Data");
      data.onChange({ ...data, frequency, detune, label, type:waveform, frequencyType: oscFrequencyType, midiNode, knobValue, freqMidiMapping, detuneMidiMapping, pulseWidth, periodicWaveHarmonics });
    }

    // You can add additional logic here
  }, [frequency, detune, label, waveform, oscFrequencyType, midiNode, knobValue, style, pulseWidth, periodicWaveHarmonics]);

  function changebackgroundColor(color: string) {
    setStyle({ ...style, background: color });
    //console.log("Background color changed:", color);
  }

  useEffect(() => {
    eventBus.subscribe(data.id+".style.background",changebackgroundColor); 
    return () => {
      eventBus.unsubscribe(data.id + ".style.background", changebackgroundColor);
    };
  });

  function changeValue(value: number) {
    isUserChangingKnob.current = true;
    setKnobValue(value);
    const f = knobToFrequency(value);
    setFrequency(f);
  }

  function changeDetuneValue(value: number) {
    setKnobDetuneValue(value);
    setDetune(knobToFrequencyDetune(value));
  }

  function beforeSetOscFrequencyType(value: FrequencyType) {
    setOscFrequencyType(value);
    if (value == "midi") {
      setKnobMin(24);
      setKnobMax(96);
    } else if (value == "hz") {
      setKnobMin(0);
      setKnobMax(100);
    } else if (value == "lfo") {
      setKnobMin(0);
      setKnobMax(250);
    }
  }

  // When knob range changes (e.g., switching to LFO), update existing MIDI mappings so scaling stays correct
  useEffect(() => {
    setFreqMidiMapping(m => m ? { ...m, min: knobMin, max: knobMax } : m);
    setDetuneMidiMapping(m => m ? { ...m, min: knobMax * -1, max: knobMax } : m);
  }, [knobMin, knobMax]);

  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "60px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  return (
    <div
      style={data.style}
    >
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>OSC</b></span>
      </div>
      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: '10px', height: '10px' }}
      />

      {/* Main Output */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="mainOutput"
        />

        {/* Frequency Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Freq.</span>
          <MidiKnob
            min={knobMin}
            max={knobMax}
            value={knobValue}
            onChange={(v)=> changeValue(v)}
            midiMapping={freqMidiMapping}
            midiSmoothing={1}
            midiSensitivity={0.5}
            onMidiLearnChange={setFreqMidiMapping}
            label="Freq"
            persistKey={`osc:${data.flowId || 'default'}:${data.id}:freq`}
          />
          <input
            type="text"
            value={frequency}
            onChange={(e) => { setFrequency(parseFloat(e.target.value)) }}
            className=""
            style={{ 
              width: 50, 
              background: '#222', 
              color: '#eee', 
              border: '1px solid #444', 
              borderRadius: 4, 
              padding: '1px 3px', 
              fontSize: 10, 
              textAlign: 'center',
              marginBottom: '3px' 
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="frequency"
            style={{ top: 55 }}
          />
        </div>

        {/* Detune Input with MIDI-learnable knob */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>Detune</span>
          <MidiKnob
            min={knobMax * -1}
            max={knobMax}
            value={knobDetuneValue}
            onChange={(v)=> changeDetuneValue(v)}
            midiMapping={detuneMidiMapping}
            onMidiLearnChange={setDetuneMidiMapping}
            label="Detune"
            persistKey={`osc:${data.flowId || 'default'}:${data.id}:detune`}
          />
          <input
            type="text"
            value={detune}
            onChange={(e) => setDetune(parseFloat(e.target.value))}
            className=""
            style={
              { 
                width: 50, 
                background: '#222', 
                color: '#eee', 
                border: '1px solid #444', 
                borderRadius: 4, 
                padding: '1px 3px', 
                fontSize: 10, 
                textAlign: 'center',
                marginBottom: '3px' 
              }
            }
          />
          <Handle
            type="target"
            position={Position.Left}
            id="detune"
            style={{ top: 139 }}
          />
        </div>
      {/* Type Selector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <select
          value={waveform}
          onChange={(e) => setWaveform(e.target.value as OscillatorType)}
          style={{ width: 62, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 2px', fontSize: 9, textAlign: 'center' }}
        >
          {["sine", "square", "sawtooth", "triangle", "custom"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {/* Pulse Width control — shown only when waveform is "custom" */}
      {waveform === "custom" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10 }}>Pulse W.</span>
          <MidiKnob
            min={1}
            max={99}
            value={Math.round(pulseWidth * 100)}
            onChange={(v) => setPulseWidth(v / 100)}
            midiMapping={null}
            onMidiLearnChange={() => {}}
            label="PW"
            persistKey={`osc:${data.flowId || 'default'}:${data.id}:pw`}
          />
          <span style={{ fontSize: 9, color: '#aaa' }}>{Math.round(pulseWidth * 100)}%</span>
          <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 9 }}>Harmonics</span>
            <input
              type="number"
              min={8}
              max={512}
              step={8}
              value={periodicWaveHarmonics}
              onChange={(e) => setPeriodicWaveHarmonics(Math.max(8, Math.min(512, parseInt(e.target.value) || 128)))}
              style={{
                width: 42,
                background: '#222',
                color: '#eee',
                border: '1px solid #444',
                borderRadius: 4,
                padding: '1px 3px',
                fontSize: 9,
                textAlign: 'center',
              }}
            />
          </div>
        </div>
      )}
      {/* Frequency Type Selector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <select
          value={oscFrequencyType}
          onChange={(e) => beforeSetOscFrequencyType(e.target.value as FrequencyType)}
          style={{ width: 62, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 2px', fontSize: 9, textAlign: 'center' }}
        >
          {["midi", "hz", "lfo"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {oscFrequencyType == "midi" && (
        <div>
          <span>Midi Note: {midiNode}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(OscillatorFlowNode);