// End-to-end: download a real VibeSynth gallery .vstai (acid-bass), host it via
// @synflow/core's VirtualVstaiNode (AudioWorklet + wasm), schedule a note, and
// assert a sample-accurate onset. Skips (pass) when the gallery is unreachable.
import { OfflineAudioContext } from 'node-web-audio-api';
const nwaa = await import('node-web-audio-api');
globalThis.OfflineAudioContext = OfflineAudioContext;
for (const k of Object.keys(nwaa)) if (!(k in globalThis)) { try { globalThis[k] = nwaa[k]; } catch { /* readonly */ } }
const { AudioGraphManager, EventBus } = await import('@synflow/core');

let doc;
try {
  doc = await (await fetch('https://k1ln.github.io/VibePlugin/gallery/data/acid-bass.vstai', { signal: AbortSignal.timeout(15000) })).json();
} catch {
  console.log('SKIP: VibeSynth gallery unreachable (offline?) — vstai test skipped');
  process.exit(0);
}

const params = doc.params || [];
const data = {
  vstaiName: 'acid', wasmBase64: doc.wasmBase64, isInstrument: true, isTrigger: true, frequency: 220,
  knobs: params.map((p) => ({ param: `param${p.index}`, label: String(p.name), min: +p.min || 0, max: +p.max || 1, default: +p.default || 0 })),
};
for (const p of params) data[`param${p.index}`] = Number(p.value ?? p.default ?? 0);
const transport = params.find((p) => /transport/i.test(String(p.name)));
if (transport) data[`param${transport.index}`] = 0;   // host drives notes, not the built-in sequencer

const SR = 44100;
const ctx = new OfflineAudioContext(2, SR, SR);
const engine = new AudioGraphManager(
  ctx,
  { current: [{ id: 'vstai', type: 'AiVstFlowNode', data }, { id: 'master', type: 'MasterOutFlowNode', data: {} }] },
  { current: [{ id: 'e', source: 'vstai', target: 'master', sourceHandle: 'output', targetHandle: 'destination-input' }] },
  { bus: new EventBus(), destination: ctx.destination },
);
await engine.initialize();
engine.receiveNodeOn('vstai', 'main-input', { when: 0.25, frequency: 110, velocity: 1 });
engine.receiveNodeOff('vstai', 'main-input', { when: 0.6 });
await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));

const d = (await ctx.startRendering()).getChannelData(0);
let onset = -1, peak = 0;
for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (onset < 0 && v > 1e-3) onset = i; }
const want = Math.round(0.25 * SR);
console.log(`vstai: peak ${peak.toFixed(3)} · onset ${onset} (want ${want}) · err ${onset - want} samples`);
const pass = peak > 0.01 && Math.abs(onset - want) <= 128;
console.log(pass ? 'PASS: gallery .vstai renders sample-accurately through the web engine' : 'FAIL');
process.exit(pass ? 0 : 1);
