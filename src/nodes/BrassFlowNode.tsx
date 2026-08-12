import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import EventBus from "../sys/EventBus";
import "./AudioNode.css";

export type BrassFlowNodeProps = {
  data: {
    label: string;
    frequency: number;
    tension: number;
    slide: number;
    attack: number;
    release: number;
    vibratoRate: number;
    vibratoGain: number;
    style: React.CSSProperties;
    id?: string;
    flowId?: string;
    onChange?: (data: any) => void;
    freqMidiMapping?: MidiMapping | null;
    tensionMidiMapping?: MidiMapping | null;
    slideMidiMapping?: MidiMapping | null;
    attackMidiMapping?: MidiMapping | null;
    releaseMidiMapping?: MidiMapping | null;
    vibratoRateMidiMapping?: MidiMapping | null;
    vibratoGainMidiMapping?: MidiMapping | null;
  };
};

const ACCENT = "#e0a53d"; // brass gold (source family)

const BrassFlowNode: React.FC<BrassFlowNodeProps> = ({ data }) => {
  const FREQ_MIN = 20;
  const FREQ_MAX = 2000;
  const normFromFreq = (f: number) => {
    const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, f));
    return Math.log(clamped / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  };
  const freqFromNorm = (n: number) => {
    const nn = Math.min(1, Math.max(0, n));
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, nn);
  };

  const [frequency, setFrequency] = useState(data.frequency ?? 220);
  const [freqNorm, setFreqNorm] = useState(normFromFreq(data.frequency ?? 220));
  const [tension, setTension] = useState(data.tension ?? 0.5);
  const [slide, setSlide] = useState(data.slide ?? 0.5);
  const [attack, setAttack] = useState(data.attack ?? 0.05);
  const [release, setRelease] = useState(data.release ?? 0.1);
  const [vibratoRate, setVibratoRate] = useState(data.vibratoRate ?? 0.5);
  const [vibratoGain, setVibratoGain] = useState(data.vibratoGain ?? 0.0);
  const [label, setLabel] = useState(data.label ?? "Brass");
  const [freqMidiMapping, setFreqMidiMapping] = useState<MidiMapping | null>(data.freqMidiMapping ?? null);
  const [tensionMidiMapping, setTensionMidiMapping] = useState<MidiMapping | null>(data.tensionMidiMapping ?? null);
  const [slideMidiMapping, setSlideMidiMapping] = useState<MidiMapping | null>(data.slideMidiMapping ?? null);
  const [attackMidiMapping, setAttackMidiMapping] = useState<MidiMapping | null>(data.attackMidiMapping ?? null);
  const [releaseMidiMapping, setReleaseMidiMapping] = useState<MidiMapping | null>(data.releaseMidiMapping ?? null);
  const [vibratoRateMidiMapping, setVibratoRateMidiMapping] = useState<MidiMapping | null>(data.vibratoRateMidiMapping ?? null);
  const [vibratoGainMidiMapping, setVibratoGainMidiMapping] = useState<MidiMapping | null>(data.vibratoGainMidiMapping ?? null);

  const nodeId = (data as any).id || "brass";
  const flowId = (data as any).flowId || "default";

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data, frequency, tension, slide, attack, release, vibratoRate, vibratoGain, label,
        freqMidiMapping, tensionMidiMapping, slideMidiMapping,
        attackMidiMapping, releaseMidiMapping, vibratoRateMidiMapping, vibratoGainMidiMapping,
      });
    }
  }, [frequency, tension, slide, attack, release, vibratoRate, vibratoGain, label,
    freqMidiMapping, tensionMidiMapping, slideMidiMapping, attackMidiMapping, releaseMidiMapping,
    vibratoRateMidiMapping, vibratoGainMidiMapping]);

  // Audition: hold to blow (breath on while pressed, off on release) — a
  // brass note needs sustained breath, unlike a plucked/gated one-shot.
  const blowOn = useCallback(() => {
    try { EventBus.getInstance().emit(`${nodeId}.main-input.receiveNodeOn`, { velocity: 1, frequency, value: frequency }); } catch { /* noop */ }
  }, [nodeId, frequency]);
  const blowOff = useCallback(() => {
    try { EventBus.getInstance().emit(`${nodeId}.main-input.receiveNodeOff`, {}); } catch { /* noop */ }
  }, [nodeId]);

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-row" style={{ justifyContent: "space-between", padding: "0 2px", marginBottom: 6 }}>
        <b className="node-title" style={{ margin: 0, padding: 0, border: 0, textShadow: "none" }}>BRASS</b>
        <button
          onMouseDown={blowOn}
          onMouseUp={blowOff}
          onMouseLeave={blowOff}
          onTouchStart={(e) => { e.preventDefault(); blowOn(); }}
          onTouchEnd={(e) => { e.preventDefault(); blowOff(); }}
          title="Hold to blow"
          style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, cursor: "pointer", color: "#2a1a06", fontWeight: 700, border: "none", background: ACCENT }}
        >Blow</button>
      </div>

      {/* Trigger (breath gate) / pitch in, audio out */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: "10px", height: "10px" }} />
      <Handle type="target" position={Position.Left} id="frequency" style={{ top: 44 }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-row" style={{ gap: 4 }}>
        <div className="node-field">
          <span className="node-label">Pitch</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={freqNorm}
            onChange={(n) => { setFreqNorm(n); setFrequency(freqFromNorm(n)); }}
            midiMapping={freqMidiMapping}
            onMidiLearnChange={setFreqMidiMapping}
            midiSensitivity={0.5}
            midiSmoothing={0.7}
            label="Pitch"
            persistKey={`brass:${flowId}:${nodeId}:freqLog`}
          />
          <input
            type="text"
            value={Math.round(frequency * 100) / 100}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) { const c = Math.min(FREQ_MAX, Math.max(FREQ_MIN, val)); setFrequency(c); setFreqNorm(normFromFreq(c)); }
            }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Tension</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={tension}
            onChange={(v) => setTension(Math.min(1, Math.max(0, v)))}
            midiMapping={tensionMidiMapping}
            onMidiLearnChange={setTensionMidiMapping}
            midiSensitivity={0.5}
            label="Tension"
            persistKey={`brass:${flowId}:${nodeId}:tension`}
          />
          <input
            type="text"
            value={Math.round(tension * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTension(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Slide</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={slide}
            onChange={(v) => setSlide(Math.min(1, Math.max(0, v)))}
            midiMapping={slideMidiMapping}
            onMidiLearnChange={setSlideMidiMapping}
            midiSensitivity={0.5}
            label="Slide"
            persistKey={`brass:${flowId}:${nodeId}:slide`}
          />
          <input
            type="text"
            value={Math.round(slide * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setSlide(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>
      </div>

      <div className="node-row" style={{ gap: 4, marginTop: 6 }}>
        <div className="node-field">
          <span className="node-label">Attack</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={attack}
            onChange={(v) => setAttack(Math.min(1, Math.max(0, v)))}
            midiMapping={attackMidiMapping}
            onMidiLearnChange={setAttackMidiMapping}
            midiSensitivity={0.5}
            label="Attack"
            persistKey={`brass:${flowId}:${nodeId}:attack`}
          />
          <input
            type="text"
            value={Math.round(attack * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAttack(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Release</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={release}
            onChange={(v) => setRelease(Math.min(1, Math.max(0, v)))}
            midiMapping={releaseMidiMapping}
            onMidiLearnChange={setReleaseMidiMapping}
            midiSensitivity={0.5}
            label="Release"
            persistKey={`brass:${flowId}:${nodeId}:release`}
          />
          <input
            type="text"
            value={Math.round(release * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setRelease(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Vib Rate</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={vibratoRate}
            onChange={(v) => setVibratoRate(Math.min(1, Math.max(0, v)))}
            midiMapping={vibratoRateMidiMapping}
            onMidiLearnChange={setVibratoRateMidiMapping}
            midiSensitivity={0.5}
            label="Vib Rate"
            persistKey={`brass:${flowId}:${nodeId}:vibratoRate`}
          />
          <input
            type="text"
            value={Math.round(vibratoRate * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVibratoRate(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>

        <div className="node-field">
          <span className="node-label">Vib Gain</span>
          <MidiKnob
            accentColor={ACCENT}
            min={0}
            max={1}
            value={vibratoGain}
            onChange={(v) => setVibratoGain(Math.min(1, Math.max(0, v)))}
            midiMapping={vibratoGainMidiMapping}
            onMidiLearnChange={setVibratoGainMidiMapping}
            midiSensitivity={0.5}
            label="Vib Gain"
            persistKey={`brass:${flowId}:${nodeId}:vibratoGain`}
          />
          <input
            type="text"
            value={Math.round(vibratoGain * 1000) / 1000}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVibratoGain(Math.min(1, Math.max(0, v))); }}
            className="node-input"
            style={{ width: 50 }}
          />
        </div>
      </div>
    </div>
  );
};

export const defaultData = {
  label: "Brass",
  frequency: 220,
  tension: 0.5,
  slide: 0.5,
  attack: 0.05,
  release: 0.1,
  vibratoRate: 0.5,
  vibratoGain: 0.0,
};

export default React.memo(BrassFlowNode);
