// Low-RAM, sample-accurate streaming playback of one audio clip. A tiny
// AudioWorklet emits the clip's frames, gated to start on an exact audio-clock
// sample; the main thread feeds it ~0.5 s slices read straight off the on-disk WAV
// (Blob.slice) so a dozen hour-long clips can play at once without decoding them.
import { readWavFrames, type WavMeta } from './wavReader';
import { scheduleFade } from './clipFade';

// ── worklet processor (runs on the audio thread) ─────────────────────────────
// Keeps a queue of planar Float32 chunks; outputs silence until the clock reaches
// `startTime`, then streams `total` frames and ends. Requests more when low.
const PROCESSOR_CODE = `
class ClipStreamProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.startSample = Math.round((o.startTime || 0) * sampleRate);
    this.total = o.total || 0;
    this.lowWater = o.lowWater || sampleRate;
    this.queue = [];
    this.queued = 0;
    this.played = 0;
    this.started = false;
    this.ended = false;
    this.needSent = false;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'data') {
        const chans = d.chans.map((b) => new Float32Array(b));
        this.queue.push({ chans, pos: 0 });
        this.queued += chans[0] ? chans[0].length : 0;
        this.needSent = false;
      } else if (d.type === 'stop') {
        this.ended = true;
      }
    };
  }
  pull(output, start, n) {
    let filled = 0;
    while (filled < n && this.queue.length) {
      const head = this.queue[0];
      const len = head.chans[0] ? head.chans[0].length : 0;
      const take = Math.min(len - head.pos, n - filled);
      for (let c = 0; c < output.length; c++) {
        const src = head.chans[Math.min(c, head.chans.length - 1)];
        const dst = output[c];
        for (let i = 0; i < take; i++) dst[start + filled + i] = src ? src[head.pos + i] : 0;
      }
      head.pos += take; this.queued -= take; filled += take;
      if (head.pos >= len) this.queue.shift();
    }
    return filled; // underrun → the rest of the block stays silent
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    if (this.ended) return false;
    const n = out[0].length;
    if (!this.needSent && this.queued < this.lowWater && this.played < this.total) {
      this.port.postMessage({ type: 'need' });
      this.needSent = true;
    }
    const blockStart = Math.round(currentTime * sampleRate);
    if (!this.started) {
      if (blockStart + n <= this.startSample) return true; // before onset: silence
      const offset = Math.max(0, this.startSample - blockStart);
      this.started = true;
      this.played += this.pull(out, offset, Math.min(n - offset, this.total));
      return true;
    }
    if (this.played >= this.total) { this.port.postMessage({ type: 'ended' }); return false; }
    this.played += this.pull(out, 0, Math.min(n, this.total - this.played));
    if (this.played >= this.total) { this.port.postMessage({ type: 'ended' }); return false; }
    return true;
  }
}
registerProcessor('clip-stream-processor', ClipStreamProcessor);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
/** Add the streaming processor module to a context once. */
export function ensureClipStreamModule(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([PROCESSOR_CODE], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    loaded.set(ctx, p);
  }
  return p;
}

export interface ClipStreamOpts {
  startTime: number;   // audio-clock time the clip's first sample should sound
  offsetSec: number;   // seconds into the source file to start from
  durationSec: number; // how long to play
  gain: number;
  fadeIn?: number;     // fade-in length (s)
  fadeOut?: number;    // fade-out length (s)
  dest: AudioNode;
  onEnded?: () => void; // called once the clip finishes streaming
}

// ── main-thread feeder ───────────────────────────────────────────────────────
export class ClipStreamer {
  private node: AudioWorkletNode;
  private gain: GainNode;
  private cursor: number;    // next OUTPUT-rate frame to read
  private endFrame: number;  // output-rate frame to stop reading at
  private reading = false;
  private done = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onEnded?: () => void;

  constructor(private ctx: BaseAudioContext, private blob: Blob, private meta: WavMeta, opts: ClipStreamOpts) {
    this.onEnded = opts.onEnded;
    const rate = ctx.sampleRate;
    const totalOut = Math.max(0, Math.round(opts.durationSec * rate));
    this.cursor = Math.round(opts.offsetSec * rate);
    this.endFrame = this.cursor + totalOut;
    this.node = new AudioWorkletNode(ctx, 'clip-stream-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { startTime: opts.startTime, total: totalOut, lowWater: Math.round(rate * 1.0) },
    });
    this.gain = ctx.createGain();
    scheduleFade(this.gain.gain, opts.gain, opts.startTime, opts.durationSec, opts.fadeIn, opts.fadeOut);
    this.node.connect(this.gain).connect(opts.dest);
    this.node.port.onmessage = (e) => {
      const t = (e.data as any)?.type;
      if (t === 'need') void this.pump();
      else if (t === 'ended') this.stop();
    };
    void this.pump();                                    // prime
    this.timer = setInterval(() => void this.pump(), 200); // keep ahead of the worklet
  }

  private async pump(): Promise<void> {
    if (this.reading || this.done || this.cursor >= this.endFrame) return;
    this.reading = true;
    try {
      const rate = this.ctx.sampleRate;
      const want = Math.min(Math.round(rate * 0.5), this.endFrame - this.cursor); // ~0.5 s/read
      const srcStart = Math.round((this.cursor / rate) * this.meta.sampleRate);
      const chans = await readWavFrames(this.blob, this.meta, srcStart, want, rate);
      if (this.done) return;
      const bufs = chans.map((c) => c.buffer);
      this.node.port.postMessage({ type: 'data', chans: bufs }, bufs);
      this.cursor += want;
    } finally {
      this.reading = false;
    }
  }

  stop(): void {
    if (this.done) return; this.done = true;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    try { this.node.port.postMessage({ type: 'stop' }); } catch { /* noop */ }
    try { this.node.disconnect(); } catch { /* noop */ }
    try { this.gain.disconnect(); } catch { /* noop */ }
    const cb = this.onEnded; this.onEnded = undefined; cb?.();
  }
}
