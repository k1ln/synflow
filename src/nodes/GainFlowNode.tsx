import React, { useState,useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import MidiKnob, { MidiMapping } from "../components/MidiKnob";
import "./AudioNode.css";

/**
 * #file:GainFlowNode.tsx #VirtualGainNode
 *
 * The Gain node is a utility building block in the virtual audio graph that
 * controls the amplitude (loudness / intensity) of an incoming signal.
 *
 * Conceptually, it wraps a Web Audio `GainNode`-like behaviour, but in the
 * context of the flow editor:
 * - The **main audio input** arrives on the left handle (`main-input`).
 * - The **processed (scaled) audio output** leaves via the right handle (`output`).
 * - An optional **control input** on the left (`gain`) can modulate the gain
 *   value over time (for automation, envelopes, LFOs, MIDI CC, etc.).
 *
 * The `gain` value itself represents a **linear amplitude factor**, not
 * decibels. A value of:
 * - `0`      mutes the signal completely.
 * - `1`      passes the signal through at unity gain (no change).
 * - `> 1`    amplifies the signal (can become very loud).
 * - Very large values (up to `MAX_GAIN`) are technically possible but should
 *   be used with care because they can produce clipping or distortion
 *   downstream if the audio chain is not designed for it.
 *
 * ## Knob mapping / feel
 *
 * Directly exposing the full numeric range of a gain node to a 0..1 UI knob
 * tends to feel wrong: the interesting region (0..a few units) is compressed
 * into a tiny slice at the bottom, while most of the knob travel jumps between
 * huge values that are rarely musically useful.
 *
 * To address this, the Gain node uses a **piecewise, non‑linear mapping**
 * between the knob position `k` (0..1) and the actual gain value `g`:
 *
 * - For `k` in `[0, 0.5)`:
 *   - The knob controls a gentle curve from `g = 0` up to `g = MID_GAIN`.
 *   - This region is controlled by the `LOW_EXP` exponent and is where most
 *     subtle mixing work happens (0..5x gain by default).
 * - For `k` in `(0.5, 1]`:
 *   - The knob spans from `g = MID_GAIN` up to `g = MAX_GAIN`.
 *   - This region uses a steeper `HIGH_EXP` exponent so that the curve still
 *     feels controllable near the midpoint but can reach very high
 *     amplification towards the end.
 * - The special value `k < ~0.003` is treated as **hard mute**, forcing
 *   `g = 0` to avoid tiny residual gains when the knob is visually at zero.
 *
 * This mapping ensures:
 * - `f(0)   = 0`       (silent)
 * - `f(0.5) = MID_GAIN` (useful mid‑range, e.g. 5x)
 * - `f(1)   = MAX_GAIN` (extreme boost)
 *
 * The inverse function `gainToKnob` performs the opposite transformation so
 * that when an existing flow is loaded (with a stored `gain` value), the knob
 * position reflects it correctly. That keeps the UI in sync with serialized
 * state and makes it possible to show the right position even when gain was
 * set programmatically or via automation.
 *
 * ## MIDI‑controllable gain
 *
 * The node integrates with the global MIDI system via `MidiKnob`:
 * - Right‑click (context menu) on the knob enters **MIDI learn** mode.
 * - Moving a MIDI controller sends CC messages which are captured and
 *   associated with this specific knob (`MidiMapping`).
 * - After mapping, incoming CC values are translated into knob movements,
 *   which are then converted to gain values using the mapping above.
 * - The mapping can optionally operate in a relative encoder mode
 *   (`relativeMode = 'twosComplement'`) for endless encoders.
 *
 * The resulting `MidiMapping` is propagated via `data.onChange` so the host
 * system can persist it (e.g. in the flow JSON or separate storage), allowing
 * the Gain node to remember its controller assignment across reloads.
 *
 * ## Data model & persistence hooks
 *
 * The `data` prop carries both UI and state information:
 * - `label`: user‑visible title of the node, usually shown in the header.
 * - `gain`: current linear gain value (the authoritative numeric state).
 * - `style`: inline CSS used to theme the node (colors, borders, etc.).
 * - `onChange`: callback invoked whenever relevant state (gain, label,
 *   `gainMidiMapping`) changes. The callback receives the full updated `data`
 *   object so that callers can store it or sync it into a larger document.
 *
 * Internally, the component manages:
 * - `gain`: current gain value (linear). This is what should ultimately drive
 *   the underlying audio `GainNode` in the engine.
 * - `gainKnob`: knob position in 0..1 space, computed from `gain` using
 *   `gainToKnob` and updated via `knobToGain` when the user moves the knob.
 * - `gainInput`: string representation shown in the numeric input field,
 *   formatted to four decimals and validated on blur.
 * - `gainMidiMapping`: optional mapping that defines how incoming MIDI CC
 *   values are turned into knob/gain updates.
 *
 * Any change to `gain` or `label` triggers a side effect that keeps
 * `gainInput` in sync and calls `data.onChange` (if provided). This makes the
 * node a self‑contained UI widget which still exposes a clean, serialisable
 * state surface to the outside.
 *
 * ## Handles / connectivity
 *
 * The three `Handle` components define how this node plugs into the graph:
 *
 * - `main-input` (type="target", left, top≈20):
 *   - Primary audio input.
 *   - Typical connections: oscillators, samplers, filters, or upstream
 *     processing nodes.
 * - `output` (type="source", right):
 *   - Primary audio output after gain has been applied.
 *   - Typical connections: mixers, master out, reverb, delay, or other effect
 *     nodes.
 * - `gain` (type="target", left, top≈55):
 *   - Control input that can drive/override the gain value over time.
 *   - Typical connections: envelopes (ADSR), LFOs, sequencers, automation
 *     nodes, or MIDI‑derived control signals.
 *
 * In the actual audio engine, the Gain node is expected to:
 * - Take the incoming audio signal.
 * - Multiply it sample‑wise by the current `gain` value (possibly after
 *   smoothing / interpolation).
 * - Route the result to `output`.
 * - Interpret the `gain` control input as a modulation signal that can
 *   influence the final gain, depending on how the host graph wires it up.
 *
 * This detailed behaviour description is intended to help tooling (and human
 * readers) understand exactly what #VirtualGainNode does, so that AI‑driven
 * documentation, auto‑wiring, or flow suggestions can reason about it
 * accurately.
 */

export type GainFlowNodeProps = {
  data: {
    label: string;
    gain: number;
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
};

const GainFlowNode: React.FC<GainFlowNodeProps> = ({ data }) => {
  // Piecewise mapping:
  // 0..0.5 knob -> 0..MID_GAIN (gentle exponent LOW_EXP)
  // 0.5..1 knob -> MID_GAIN..MAX_GAIN (exponent HIGH_EXP)
  // Ensures f(0.5)=MID_GAIN, f(1)=MAX_GAIN, f(0)=0, but flatter than single huge exponent.
  const MAX_GAIN = 10000;
  const MID_GAIN = 5;
  const LOW_EXP = 1.3;   // adjust for curvature below midpoint (1 = linear)
  const HIGH_EXP = 2.2;  // adjust for curvature above midpoint

  const knobToGain = (k: number) => {
    if (k < 0.003) return 0; // avoid tiny nonzero gains
    if (k < 0.5) {
      const norm = k / 0.5; // 0..1
      return MID_GAIN * Math.pow(norm, LOW_EXP);
    }
    if (k >= 1) return MAX_GAIN;
    const norm = (k - 0.5) / 0.5; // 0..1
    return MID_GAIN + (MAX_GAIN - MID_GAIN) * Math.pow(norm, HIGH_EXP);
  };

  const gainToKnob = (g: number) => {
    if (g <= 0) return 0;
    if (g < MID_GAIN) {
      const norm = Math.pow(g / MID_GAIN, 1 / LOW_EXP); // 0..1
      return norm * 0.5;
    }
    if (g >= MAX_GAIN) return 1;
    const norm = Math.pow((g - MID_GAIN) / (MAX_GAIN - MID_GAIN), 1 / HIGH_EXP); // 0..1
    return 0.5 + norm * 0.5;
  };
  const initialGain = data.gain ?? 0;
  const nodeId = (data as any).id;
  const flowId = (data as any).flowId || 'default';
  const [gain, setGain] = useState<number>(initialGain);
  const [gainKnob, setGainKnob] = useState<number>(gainToKnob(initialGain));
  const [label, setLabel] = useState(data.label);
  const [gainMidiMapping, setGainMidiMapping] = useState<MidiMapping | null>(null);
  const [gainInput, setGainInput] = useState<string>(Number.isFinite(initialGain) ? initialGain.toFixed(4) : '');
  useEffect(() => {
    // Sync gainInput with gain when gain changes from knob or programmatically
    setGainInput(Number.isFinite(gain) ? gain.toFixed(4) : '');
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, gain, label, gainMidiMapping });
    }
    // ...additional logic...
  }, [gain, label]);
  if (data.style === undefined) {
    data.style = {
      padding: "0px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "40px",
      textAlign: "center",
      background: "#1f1f1f",
      color: "#eee",
    }
  }
  
  return (
    <div style={data.style}>
      <div style={{ textAlign: "center", marginBottom: "0px" }}>
        <span><b>GAIN</b></span>
      </div>

      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 20, width: "10px", height: "10px" }}
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="mainOutput"
      />

      {/* Gain Input with MIDI-learnable knob */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <MidiKnob
          min={0}
          max={1}
          value={gainKnob}
          onChange={(k)=> {
            const kClamped = Math.min(1, Math.max(0, k));
            setGainKnob(kClamped);
            const g = knobToGain(kClamped);
            setGain(g);
          }}
          midiMapping={gainMidiMapping}
          onMidiLearnChange={setGainMidiMapping}
          midiSensitivity={0.5}
          midiSmoothing={0.5}
          label="Gain"
          persistKey={nodeId ? `gain:${flowId}:${nodeId}` : undefined}
        />
        <input
          type="text"
          value={gainInput}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onChange={(e) => {
            // Only update the input field, not the gain value
            setGainInput(e.target.value);
          }}
          onBlur={() => {
            // On blur, update gain only if valid, else set to 0
            const val = gainInput;
            const num = parseFloat(val);
            if (val === '' || isNaN(num)) {
              setGain(0);
              setGainKnob(gainToKnob(0));
              setGainInput('0.0000');
            } else {
              const clamped = Math.min(MAX_GAIN, Math.max(0, num));
              setGain(clamped);
              setGainKnob(gainToKnob(clamped));
              setGainInput(clamped.toFixed(4));
            }
          }}
          style={{
            width: 55,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '1px 3px',
            fontSize: 10,
            textAlign: 'center',
            marginBottom: '3px',
          }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="gain"
          style={{ top: 55 }}
        />
      </div>
    </div>
  );
};

export default GainFlowNode;