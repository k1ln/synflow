// Render test: verify sample-accurate note scheduling through the real engine.
// Builds the DAW's actual "basic synth" flow (Osc → Gain, ADSR(trigger) → Gain.gain)
// via @synflow/core's AudioGraphManager, triggers notes with `when`, renders
// offline, and measures each note's actual onset sample vs the requested time.
import { OfflineAudioContext, AudioContext, GainNode, OscillatorNode } from 'node-web-audio-api';

// node-web-audio-api needs globals for the engine's instanceof checks
globalThis.OfflineAudioContext = OfflineAudioContext;
globalThis.AudioContext = AudioContext;
const nwaa = await import('node-web-audio-api');
for (const k of Object.keys(nwaa)) {
  if (k.endsWith('Node') || k === 'AudioParam' || k === 'AudioBuffer' || k === 'PeriodicWave') {
    if (!(k in globalThis)) globalThis[k] = nwaa[k];
  }
}

const { AudioGraphManager, EventBus } = await import('@synflow/core');

const SR = 44100;

function makeSynthFlow() {
  return {
    nodes: [
      { id: 'osc', type: 'OscillatorFlowNode', data: { frequency: 440, type: 'sine', isPitch: true, pitchParam: 'frequency' } },
      { id: 'adsr', type: 'ADSRFlowNode', data: { attackTime: 0.001, decayTime: 0.05, sustainLevel: 0.8, releaseTime: 0.02, maxTime: 10, minPercent: 0, maxPercent: 100, isTrigger: true } },
      { id: 'gain', type: 'GainFlowNode', data: { gain: 1 } },
      { id: 'master', type: 'MasterOutFlowNode', data: {} },
    ],
    edges: [
      { id: 'e1', source: 'adsr', target: 'gain', sourceHandle: 'output', targetHandle: 'gain' },
      { id: 'e2', source: 'osc', target: 'gain', sourceHandle: 'output', targetHandle: 'main-input' },
      { id: 'e3', source: 'gain', target: 'master', sourceHandle: 'output', targetHandle: 'destination-input' },
    ],
  };
}

// Notes at deliberately non-block-aligned times (worst case for block quantization).
const NOTES = [0.1003, 0.2517, 0.40011, 0.55555, 0.703];
const NOTE_LEN = 0.08;

const ctx = new OfflineAudioContext(1, SR, SR);
const flow = makeSynthFlow();
const bus = new EventBus();
const engine = new AudioGraphManager(
  ctx,
  { current: flow.nodes },
  { current: flow.edges },
  { bus, destination: ctx.destination },
);
await engine.initialize();

// Idle state: the envelope target starts silent (a fresh voice hasn't been
// triggered yet); the ADSR ramps it up from here at each scheduled noteOn.
engine.getAudioParam('gain', 'gain').value = 0;

// Fire all triggers up-front (extreme "delivered early" case: delivery jitter is
// maximal, execution must still be exact).
for (const t of NOTES) {
  engine.receiveNodeOn('adsr', 'main-input', { when: t, onWhen: t });
  engine.receiveNodeOff('adsr', 'main-input', { when: t + NOTE_LEN, onWhen: t });
}

// The engine's EventBus defers subscribers via setTimeout(0) — drain before rendering.
await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));

const rendered = await ctx.startRendering();
const data = rendered.getChannelData(0);

// Detect onsets: first sample above threshold after a quiet zone.
const TH = 1e-4;
const onsets = [];
let quiet = true;
for (let i = 0; i < data.length; i++) {
  const loud = Math.abs(data[i]) > TH;
  if (loud && quiet) { onsets.push(i); quiet = false; }
  // re-arm once fully quiet for 400 samples
  if (!loud) {
    let allQuiet = true;
    for (let j = i; j < Math.min(i + 400, data.length); j++) if (Math.abs(data[j]) > TH) { allQuiet = false; break; }
    if (allQuiet) { quiet = true; i += 399; }
  }
}

console.log('expected onsets (samples):', NOTES.map((t) => Math.round(t * SR)));
console.log('detected onsets (samples):', onsets);

let pass = true;
if (onsets.length !== NOTES.length) { pass = false; console.error(`FAIL: expected ${NOTES.length} onsets, got ${onsets.length}`); }
else {
  for (let i = 0; i < NOTES.length; i++) {
    const want = NOTES[i] * SR;
    const err = onsets[i] - want;
    // 1-sample attack ramp start + detection threshold ⇒ allow ≤ 2 samples error
    const ok = Math.abs(err) <= Math.ceil(0.001 * SR) + 2; // attack is 1ms; onset detect fires within attack
    console.log(`note ${i}: want ~${Math.round(want)}, got ${onsets[i]}, err ${err.toFixed(0)} samples (${(err / SR * 1000).toFixed(3)} ms) ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) pass = false;
  }
  // Jitter: the error should be CONSTANT (attack-ramp detection offset), variance ≈ 0.
  const errs = onsets.map((o, i) => o - NOTES[i] * SR);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const maxDev = Math.max(...errs.map((e) => Math.abs(e - mean)));
  console.log(`onset error: mean ${mean.toFixed(1)} samples, max deviation from mean ${maxDev.toFixed(1)} samples (${(maxDev / SR * 1000).toFixed(3)} ms)`);
  if (maxDev > 2) { pass = false; console.error('FAIL: onset jitter exceeds 2 samples'); }
}
console.log(pass ? '\nPASS: sample-accurate scheduling verified' : '\nFAIL');
process.exit(pass ? 0 : 1);
