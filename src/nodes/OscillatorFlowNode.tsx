import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Handle, Position } from "@xyflow/react";
import EventBus from "../sys/EventBus";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";
type FrequencyType = "midi" | "hz" | "lfo";
type CustomMode = "pulse" | "wavetable";

export const WAVETABLE_SIZE = 256;

/** Convert time-domain samples [-1..1] to a PeriodicWave via DFT. */
export function buildWavetablePeriodicWave(
  ctx: AudioContext,
  samples: number[]
): PeriodicWave {
  const N = samples.length;
  const numH = Math.min(N >> 1, 256);
  const real = new Float32Array(numH + 1);
  const imag = new Float32Array(numH + 1);
  for (let k = 0; k <= numH; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(a);
      im -= samples[n] * Math.sin(a);
    }
    real[k] = re / N;
    imag[k] = im / N;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// ── Wavetable painter ────────────────────────────────────────────────────────
const WavetablePainter: React.FC<{
  wavetable: number[];
  onChange: (wt: number[]) => void;
}> = ({ wavetable, onChange }) => {
  const cvs = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const W = 600, H = 156;

  // Draw waveform
  const draw = useCallback(() => {
    const c = cvs.current;
    if (!c) return;
    const ctx2 = c.getContext('2d')!;
    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = '#111';
    ctx2.fillRect(0, 0, W, H);
    // zero line
    ctx2.strokeStyle = '#333';
    ctx2.lineWidth = 1;
    ctx2.beginPath(); ctx2.moveTo(0, H / 2); ctx2.lineTo(W, H / 2); ctx2.stroke();
    // waveform
    ctx2.strokeStyle = '#4ade80';
    ctx2.lineWidth = 1.5;
    ctx2.beginPath();
    for (let i = 0; i < WAVETABLE_SIZE; i++) {
      const x = (i / (WAVETABLE_SIZE - 1)) * W;
      const y = ((1 - wavetable[i]) / 2) * H;
      i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y);
    }
    ctx2.stroke();
  }, [wavetable]);

  useEffect(() => { draw(); }, [draw]);

  const posToSample = (e: React.MouseEvent) => {
    const rect = cvs.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.round((x / W) * (WAVETABLE_SIZE - 1));
    const val = Math.max(-1, Math.min(1, 1 - (y / H) * 2));
    return { idx: Math.max(0, Math.min(WAVETABLE_SIZE - 1, idx)), val };
  };

  const paint = (e: React.MouseEvent) => {
    if (!painting.current) return;
    const { idx, val } = posToSample(e);
    const next = [...wavetable];
    next[idx] = val;
    // interpolate if mouse moved fast
    if (idx > 0) next[idx - 1] = (next[idx - 1] + val) / 2;
    if (idx < WAVETABLE_SIZE - 1) next[idx + 1] = (next[idx + 1] + val) / 2;
    onChange(next);
  };

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  const openPopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = btnRef.current!.getBoundingClientRect();
    setPopupPos({ x: rect.left, y: rect.bottom + 6 });
    setOpen(true);
    // canvas not yet in DOM — defer draw to next frame
    requestAnimationFrame(() => draw());
  };

  const popup = open ? ReactDOM.createPortal(
    <div
      className="nodrag nopan"
      style={{
        position: 'fixed', left: popupPos.x, top: popupPos.y,
        background: '#18181c', border: '1px solid #333', borderRadius: 8,
        padding: '10px 12px', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.05em' }}>WAVETABLE EDITOR</span>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <canvas
        ref={cvs} width={W} height={H}
        style={{ cursor: 'crosshair', borderRadius: 4, border: '1px solid #333', display: 'block' }}
        onMouseDown={(e) => { e.stopPropagation(); painting.current = true; paint(e); }}
        onMouseMove={(e) => { e.stopPropagation(); paint(e); }}
        onMouseUp={(e) => { e.stopPropagation(); painting.current = false; }}
        onMouseLeave={() => { painting.current = false; }}
      />
      <button
        style={{ fontSize: 10, padding: '2px 10px', background: '#222', color: '#aaa', border: '1px solid #444', borderRadius: 3, cursor: 'pointer' }}
        onClick={() => onChange(Array(WAVETABLE_SIZE).fill(0))}
      >clear</button>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        className="nodrag nopan"
        onClick={openPopup}
        style={{ fontSize: 8, padding: '1px 5px', background: '#222', color: '#c084fc', border: '1px solid #444', borderRadius: 3, cursor: 'pointer', marginTop: 2 }}
      >edit wavetable</button>
      {popup}
    </>
  );
};

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
    knobDetuneValue?: number;
    id:string;
    flowId?: string; // optional identifier for the overall flow/patch
    freqMidiMapping?: MidiMapping | null;
    detuneMidiMapping?: MidiMapping | null;
    pulseWidth?: number;
    periodicWaveHarmonics?: number;
    gain?: number;
    gainMidiMapping?: MidiMapping | null;
    wavetable?: number[] | null;
    customMode?: CustomMode;
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
  const [oscFrequencyType, setOscFrequencyType] = useState<FrequencyType>(data.frequencyType);
  const [midiNode, setMidiNode] = useState<string>(data.midiNode);
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  const [gain, setGain] = useState(data.gain ?? 1);
  const [gainMidiMapping, setGainMidiMapping] = useState<MidiMapping | null>(data.gainMidiMapping ?? null);

  // Piecewise gain mapping — same as GainFlowNode
  const OSC_MAX_GAIN = 10000;
  const OSC_MID_GAIN = 5;
  const OSC_LOW_EXP = 1.3;
  const OSC_HIGH_EXP = 2.2;
  const knobToGain = (k: number) => {
    if (k < 0.003) return 0;
    if (k < 0.5) return OSC_MID_GAIN * Math.pow(k / 0.5, OSC_LOW_EXP);
    if (k >= 1) return OSC_MAX_GAIN;
    return OSC_MID_GAIN + (OSC_MAX_GAIN - OSC_MID_GAIN) * Math.pow((k - 0.5) / 0.5, OSC_HIGH_EXP);
  };
  const gainToKnob = (g: number) => {
    if (g <= 0) return 0;
    if (g < OSC_MID_GAIN) return Math.pow(g / OSC_MID_GAIN, 1 / OSC_LOW_EXP) * 0.5;
    if (g >= OSC_MAX_GAIN) return 1;
    return 0.5 + Math.pow((g - OSC_MID_GAIN) / (OSC_MAX_GAIN - OSC_MID_GAIN), 1 / OSC_HIGH_EXP) * 0.5;
  };
  const [gainKnob, setGainKnob] = useState(() => gainToKnob(data.gain ?? 1));
  const [gainInput, setGainInput] = useState(() => (data.gain ?? 1).toFixed(4));
  const [wavetable, setWavetable] = useState<number[]>(data.wavetable ?? Array(WAVETABLE_SIZE).fill(0));
  const [customMode, setCustomMode] = useState<CustomMode>(data.customMode ?? 'pulse');
  
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
      data.onChange({ ...data, frequency, detune, label, type:waveform, frequencyType: oscFrequencyType, midiNode, knobValue, freqMidiMapping, detuneMidiMapping, pulseWidth, periodicWaveHarmonics, gain, gainMidiMapping, wavetable, customMode });
    }

    // You can add additional logic here
  }, [frequency, detune, label, waveform, oscFrequencyType, midiNode, knobValue, style, pulseWidth, periodicWaveHarmonics, gain, gainMidiMapping, wavetable, customMode]);

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

  // When frequency knob range changes, update freq MIDI mapping.
  // Detune is always fixed at ±100 cents (1 semitone either side).
  useEffect(() => {
    setFreqMidiMapping(m => m ? { ...m, min: knobMin, max: knobMax } : m);
    setDetuneMidiMapping(m => m ? { ...m, min: -100, max: 100 } : m);
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
      {/* Main Output */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="mainOutput"
        />
        {/* Gain modulation input */}
        <Handle
          type="target"
          position={Position.Left}
          id="gain"
          title="Gain (mod)"
          style={{ top: 'auto', bottom: 8, width: 10, height: 10, background: '#fff' }}
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
            accentColor="#4ade80"
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
            min={-100}
            max={100}
            value={detune}
            onChange={(v) => setDetune(v)}
            midiMapping={detuneMidiMapping}
            onMidiLearnChange={setDetuneMidiMapping}
            label="Detune (ct)"
            accentColor="#4ade80"
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
      {/* Gain knob — always visible */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontSize: 10 }}>Gain</span>
        <MidiKnob
          min={0}
          max={1}
          value={gainKnob}
          onChange={(k) => {
            const kc = Math.min(1, Math.max(0, k));
            setGainKnob(kc);
            const g = knobToGain(kc);
            setGain(g);
            setGainInput(g.toFixed(4));
          }}
          midiMapping={gainMidiMapping}
          onMidiLearnChange={setGainMidiMapping}
          label="Gain"
          accentColor="#4ade80"
          persistKey={`osc:${data.flowId || 'default'}:${data.id}:gain`}
        />
        <input
          type="text"
          value={gainInput}
          inputMode="decimal"
          className="nodrag"
          onChange={(e) => setGainInput(e.target.value)}
          onBlur={() => {
            const num = parseFloat(gainInput);
            if (gainInput === '' || isNaN(num)) {
              setGain(0); setGainKnob(0); setGainInput('0.0000');
            } else {
              const clamped = Math.min(OSC_MAX_GAIN, Math.max(0, num));
              setGain(clamped);
              setGainKnob(gainToKnob(clamped));
              setGainInput(clamped.toFixed(4));
            }
          }}
          style={{ width: 55, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 3px', fontSize: 10, textAlign: 'center', marginBottom: '3px' }}
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

      {/* Custom mode: pulse OR wavetable painter */}
      {waveform === "custom" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 4, gap: 4 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'stretch' }}>
            {(['pulse', 'wavetable'] as CustomMode[]).map(m => (
              <button key={m}
                onClick={() => setCustomMode(m)}
                style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, cursor: 'pointer', border: '1px solid #444', background: customMode === m ? '#fff' : '#222', color: customMode === m ? '#000' : '#888', textAlign: 'center' }}
              >{m}</button>
            ))}
          </div>

          {customMode === 'pulse' && (
            <>
              <span style={{ fontSize: 10 }}>Pulse W.</span>
              <MidiKnob
                min={1}
                max={99}
                value={Math.round(pulseWidth * 100)}
                onChange={(v) => setPulseWidth(v / 100)}
                midiMapping={null}
                onMidiLearnChange={() => {}}
                label="PW"
                accentColor="#4ade80"
                persistKey={`osc:${data.flowId || 'default'}:${data.id}:pw`}
              />
              <span style={{ fontSize: 9, color: '#aaa' }}>{Math.round(pulseWidth * 100)}%</span>
              <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 9 }}>Harmonics</span>
                <input
                  type="number" min={8} max={512} step={8}
                  value={periodicWaveHarmonics}
                  onChange={(e) => setPeriodicWaveHarmonics(Math.max(8, Math.min(512, parseInt(e.target.value) || 128)))}
                  style={{ width: 42, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '1px 3px', fontSize: 9, textAlign: 'center' }}
                />
              </div>
            </>
          )}

          {customMode === 'wavetable' && (
            <WavetablePainter
              wavetable={wavetable}
              onChange={(wt) => {
                setWavetable(wt);
                eventBus.emit(data.id + '.params.updateParams', { data: { wavetable: wt, customMode: 'wavetable' } });
              }}
            />
          )}
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