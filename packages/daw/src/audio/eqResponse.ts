// EQ frequency-response curve for the editor/thumbnail. We evaluate the *same*
// BiquadFilterNode the live engine uses (via a throwaway OfflineAudioContext +
// getFrequencyResponse), so the drawn curve is exactly what you hear — no RBJ
// formula to drift out of sync.
import type { EqBand } from '../model/project';

const ctxs = new Map<number, OfflineAudioContext>();
const ctxFor = (sampleRate: number): OfflineAudioContext => {
  let c = ctxs.get(sampleRate);
  if (!c) { c = new OfflineAudioContext(1, 1, sampleRate); ctxs.set(sampleRate, c); }
  return c;
};

/** Summed magnitude (dB) of the enabled bands at each frequency in `freqs`. */
export function eqMagnitudeDb(bands: EqBand[], freqs: Float32Array, sampleRate = 48000, outDb = 0): Float32Array {
  const c = ctxFor(sampleRate);
  const out = new Float32Array(freqs.length).fill(outDb);
  const mag = new Float32Array(freqs.length), phase = new Float32Array(freqs.length);
  for (const b of bands) {
    if (!b.on) continue;
    const f = c.createBiquadFilter();
    f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
    f.getFrequencyResponse(freqs as any, mag, phase);
    for (let i = 0; i < out.length; i++) out[i] += 20 * Math.log10(Math.max(1e-7, mag[i]));
  }
  return out;
}

/** Log-spaced frequencies spanning [fMin, fMax] for drawing the curve. */
export function logFreqs(n: number, fMin = 20, fMax = 20000): Float32Array {
  const out = new Float32Array(n);
  const lo = Math.log10(fMin), hi = Math.log10(fMax);
  for (let i = 0; i < n; i++) out[i] = 10 ** (lo + (hi - lo) * (i / (n - 1)));
  return out;
}
