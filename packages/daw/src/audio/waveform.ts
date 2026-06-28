// Waveform peak/overview extraction for fast canvas rendering at any zoom.
// We draw min/max per pixel bucket instead of raw samples.

export interface Peaks { min: Float32Array; max: Float32Array; buckets: number; }

/** Reduce a channel to `buckets` min/max pairs. */
export function computePeaks(samples: Float32Array, buckets: number): Peaks {
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const n = samples.length;
  if (n === 0 || buckets <= 0) return { min, max, buckets };
  const per = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(n, Math.floor((b + 1) * per));
    let lo = Infinity, hi = -Infinity;
    for (let i = start; i < end; i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === Infinity) { lo = 0; hi = 0; }
    min[b] = lo; max[b] = hi;
  }
  return { min, max, buckets };
}

/** Mix planar channels to mono then compute peaks (for overview thumbnails). */
export function computePeaksMixed(channels: Float32Array[], buckets: number): Peaks {
  if (channels.length === 1) return computePeaks(channels[0], buckets);
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; for (let c = 0; c < channels.length; c++) s += channels[c][i];
    mono[i] = s / channels.length;
  }
  return computePeaks(mono, buckets);
}

/**
 * Streaming peak builder: feed decoded chunks as they arrive (big-file import)
 * and read `.peaks` without ever holding the whole decoded buffer.
 */
export class StreamingPeaks {
  private min: Float32Array;
  private max: Float32Array;
  private counts: Uint32Array;
  private framesPerBucket: number;
  private frame = 0;

  constructor(public buckets: number, totalFramesEstimate: number) {
    this.min = new Float32Array(buckets).fill(Infinity);
    this.max = new Float32Array(buckets).fill(-Infinity);
    this.counts = new Uint32Array(buckets);
    this.framesPerBucket = Math.max(1, Math.ceil(totalFramesEstimate / buckets));
  }

  push(chunkMono: Float32Array): void {
    for (let i = 0; i < chunkMono.length; i++) {
      const b = Math.min(this.buckets - 1, Math.floor(this.frame / this.framesPerBucket));
      const v = chunkMono[i];
      if (v < this.min[b]) this.min[b] = v;
      if (v > this.max[b]) this.max[b] = v;
      this.counts[b]++;
      this.frame++;
    }
  }

  get peaks(): Peaks {
    const min = Float32Array.from(this.min, (v) => (v === Infinity ? 0 : v));
    const max = Float32Array.from(this.max, (v) => (v === -Infinity ? 0 : v));
    return { min, max, buckets: this.buckets };
  }
}

/** Slice stored overview peaks to a clip window [offset, offset+duration] (seconds). */
export function slicePeaks(
  p: { min: ArrayLike<number>; max: ArrayLike<number> },
  totalDuration: number, offset: number, duration: number,
): Peaks | null {
  const n = p.min.length;
  if (!n || !totalDuration) return null;
  const a = Math.max(0, Math.floor((offset / totalDuration) * n));
  const b = Math.min(n, Math.ceil(((offset + duration) / totalDuration) * n));
  const buckets = Math.max(1, b - a);
  const min = new Float32Array(buckets), max = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) { min[i] = p.min[a + i] ?? 0; max[i] = p.max[a + i] ?? 0; }
  return { min, max, buckets };
}
