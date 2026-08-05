import VirtualNode from "./VirtualNode";
import EventBus from "../EventBus";
import { CustomNode } from "../AudioGraphTypes";

// VirtualVstaiNode — hosts a VibePlugin ".vstai" (AI-written DSP compiled to WASM)
// inside a web AudioWorklet, so gallery synths/effects SOUND in the browser DAW
// exactly like they do under the native wasmtime engine.
//
// VibePlugin ABI (differs from Synflow's canonical worklet ABI):
//   init(sr, maxFrames, numCh) · process(numFrames) · planar f32 buffers via
//   getInputPtr/getOutputPtr/getParamsPtr (stride = 8192 frames/ch) · getNumParams
//   · synths add noteOn(id, freqHz, vel) / noteOff(id).
//
// Notes are frame-stamped: the host posts {noteOn, frame} ahead of time (the DAW's
// `when` scheduling) and the processor applies each event at its exact sample
// offset, splitting the 128-frame block — same discipline as the rest of Phase 1.

const STRIDE = 8192; // planar channel stride (frames) — fixed by the VibePlugin ABI

/** Generic processor: the wasm BYTES arrive via processorOptions, so this module
 *  is registered once per AudioContext and shared by every vstai node. */
const PROCESSOR_NAME = 'synflow-vstai-host';
const PROCESSOR_CODE = `
class SynflowVstaiHost extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.ok = false;
    this.queue = [];            // pending note events, sorted by frame
    this.seq = 0;               // per-voice monophonic note id
    this.lastId = 0;
    try {
      // AssemblyScript modules import env.abort (+ sometimes seed/trace).
      const env = { abort() {}, trace() {}, seed: () => 0 };
      const inst = new WebAssembly.Instance(new WebAssembly.Module(o.wasmBytes), { env });
      this.ex = inst.exports;
      this.ex.init(sampleRate, ${STRIDE}, 2);
      this.inPtr = this.ex.getInputPtr() >>> 0;
      this.outPtr = this.ex.getOutputPtr() >>> 0;
      this.parPtr = this.ex.getParamsPtr() >>> 0;
      this.numParams = this.ex.getNumParams ? (this.ex.getNumParams() | 0) : 0;
      const f32 = this.view();
      const init = Array.isArray(o.params) ? o.params : [];
      for (let i = 0; i < init.length && i < this.numParams; i++) f32[this.parPtr / 4 + i] = +init[i] || 0;
      this.ok = true;
    } catch (e) {
      this.port.postMessage({ type: 'error', message: String(e && e.message || e) });
    }
    this.port.onmessage = (ev) => {
      const m = ev.data || {};
      if (!this.ok) return;
      if (m.type === 'param') {
        if (m.index >= 0 && m.index < this.numParams) this.view()[this.parPtr / 4 + m.index] = +m.value || 0;
      } else if (m.type === 'noteOn' || m.type === 'noteOff') {
        const q = this.queue;
        q.push(m);
        q.sort((a, b) => (a.frame || 0) - (b.frame || 0));
      } else if (m.type === 'sample') {
        this.loadSample(m);
      } else if (m.type === 'allOff') {
        this.queue.length = 0;
        if (this.lastId && this.ex.noteOff) { try { this.ex.noteOff(this.lastId); } catch (_) {} }
      }
    };
  }
  view() {
    if (!this._f32 || this._f32.buffer !== this.ex.memory.buffer) this._f32 = new Float32Array(this.ex.memory.buffer);
    return this._f32;
  }
  fire(m) {
    // ABI: noteOn(noteId, freqHz, vel) / noteOff(noteId). When the event carries a
    // MIDI note number (plugin-GUI keyboards, host MIDI) it IS the id, so the
    // module can be polyphonic and noteOff matches; otherwise fall back to a
    // monophonic sequence id (the DAW's per-voice hosts).
    try {
      if (m.type === 'noteOn' && this.ex.noteOn) {
        const id = m.note != null ? (m.note | 0) : ++this.seq;
        this.lastId = id;
        const freq = +m.freq || (m.note != null ? 440 * Math.pow(2, ((m.note | 0) - 69) / 12) : 440);
        this.ex.noteOn(id, freq, m.vel == null ? 1 : +m.vel);
      } else if (m.type === 'noteOff' && this.ex.noteOff) {
        this.ex.noteOff(m.note != null ? (m.note | 0) : this.lastId);
      }
    } catch (_) {}
  }
  loadSample(m) {
    // Optional sampler region (getSamplePtr/getSampleCapacity/setSampleInfo),
    // planar with the ABI's ${STRIDE}-frame channel stride.
    if (!this.ok || !this.ex.getSamplePtr || !this.ex.setSampleInfo) return;
    try {
      const cap = this.ex.getSampleCapacity ? this.ex.getSampleCapacity() : 0;
      const ch = Math.min(2, m.channels | 0 || 1);
      const n = Math.min(m.frames | 0, cap | 0);
      const base = (this.ex.getSamplePtr() >>> 0) / 4;
      const f = this.view();
      for (let c = 0; c < ch; c++)
        for (let i = 0; i < n; i++) f[base + c * ${STRIDE} + i] = m.data[c * (m.frames | 0) + i];
      this.ex.setSampleInfo(n, ch, (m.rate | 0) || sampleRate);
      this.port.postMessage({ type: 'sampleLoaded', frames: n, channels: ch });
    } catch (e) {
      this.port.postMessage({ type: 'error', message: 'sample: ' + String(e && e.message || e) });
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.ok || !out || !out[0]) return true;
    const n = out[0].length;
    const start = currentFrame;
    const f32 = this.view();
    const inp = inputs[0];
    let s0 = 0;
    while (s0 < n) {
      // apply every event due at or before the current sample
      while (this.queue.length && (this.queue[0].frame || 0) <= start + s0) this.fire(this.queue.shift());
      // next event inside this block bounds the segment (sample-accurate split)
      let s1 = n;
      if (this.queue.length) {
        const f = (this.queue[0].frame || 0) - start;
        if (f > s0 && f < n) s1 = f;
      }
      const len = s1 - s0;
      for (let c = 0; c < 2; c++) {
        const base = this.inPtr / 4 + c * ${STRIDE};
        const src = inp && inp.length ? inp[Math.min(c, inp.length - 1)] : null;
        if (src) f32.set(src.subarray(s0, s1), base);
        else f32.fill(0, base, base + len);
      }
      this.ex.process(len);
      for (let c = 0; c < out.length; c++) {
        const base = this.outPtr / 4 + Math.min(c, 1) * ${STRIDE};
        out[c].set(f32.subarray(base, base + len), s0);
      }
      s0 = s1;
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', SynflowVstaiHost);
`;

const moduleReady = new WeakMap<BaseAudioContext, Promise<void>>();
function ensureModule(ctx: BaseAudioContext): Promise<void> {
  let p = moduleReady.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([PROCESSOR_CODE], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    moduleReady.set(ctx, p);
  }
  return p;
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Uint8Array((globalThis as any).Buffer.from(b64, 'base64'));
}

export class VirtualVstaiNode extends VirtualNode<CustomNode & { data: any }, AudioWorkletNode | undefined> {
  /** Resolves when the worklet exists (factory awaits it so edges connect reliably). */
  readonly ready: Promise<void>;

  constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & { data: any }) {
    super(audioContext, undefined, eventBus, node);
    this.ready = this.build(audioContext);

    // Note events (DAW host-MIDI path). `when` (AudioContext seconds) becomes an
    // absolute frame; the processor applies it at the exact sample.
    const frameOf = (when: unknown) =>
      typeof when === 'number' ? Math.max(0, Math.round(when * audioContext.sampleRate)) : 0;
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOn`, (d: any) => {
      const freq = d?.frequency ?? node.data?.frequency ?? 440;
      const note = d?.note ?? Math.round(69 + 12 * Math.log2(freq / 440));   // stable id per pitch
      this.audioNode?.port.postMessage({ type: 'noteOn', frame: frameOf(d?.when), note, freq, vel: d?.velocity ?? 1 });
    });
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOff`, (d: any) => {
      const msg: Record<string, unknown> = { type: 'noteOff', frame: frameOf(d?.when) };
      if (d?.note != null) msg.note = d.note;
      else if (d?.frequency != null) msg.note = Math.round(69 + 12 * Math.log2(d.frequency / 440));
      this.audioNode?.port.postMessage(msg);
    });
  }

  private async build(ctx: AudioContext): Promise<void> {
    const data = this.node.data ?? {};
    if (!data.wasmBase64) { console.warn('[VirtualVstaiNode] no wasmBase64 on', this.node.id); return; }
    await ensureModule(ctx);
    const knobs: Array<{ param: string; default?: number }> = Array.isArray(data.knobs) ? data.knobs : [];
    // initial param values by index (paramN order)
    const params: number[] = [];
    for (const k of knobs) {
      const m = /^param(\d+)$/.exec(k.param);
      if (m) params[Number(m[1])] = Number(data[k.param] ?? k.default ?? 0);
    }
    const wasmBytes = decodeBase64(String(data.wasmBase64));
    const worklet = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { wasmBytes, params, isInstrument: !!data.isInstrument },
    });
    worklet.port.onmessage = (ev) => {
      if (ev.data?.type === 'error') console.warn('[VirtualVstaiNode] wasm failed on', this.node.id, ev.data.message);
    };
    this.audioNode = worklet;
  }

  /** Param updates (knobs / automation): paramN → params-region index N. */
  handleUpdateParams(node: CustomNode & { data: any }, payload: any): void {
    if (!payload?.data) return;
    for (const key of Object.keys(payload.data)) {
      const v = payload.data[key];
      if (key in (node.data ?? {})) node.data[key] = v;
      const m = /^param(\d+)$/.exec(key);
      if (m && typeof v === 'number' && Number.isFinite(v)) {
        this.audioNode?.port.postMessage({ type: 'param', index: Number(m[1]), value: v });
      }
    }
  }

  getOutputNode(): AudioNode | undefined { return this.audioNode; }
  getInputNode(): AudioNode | undefined { return this.audioNode; }

  dispose(): void {
    try { this.audioNode?.port.postMessage({ type: 'allOff' }); } catch { /* noop */ }
    try { this.audioNode?.disconnect(); } catch { /* noop */ }
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
  }
}

export default VirtualVstaiNode;
