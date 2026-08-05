import { useEffect, useRef } from 'react';

/**
 * Loudness meter (ITU-R BS.1770-ish). Reads K-weighted per-channel analysers each
 * frame, sums channel mean-square → block loudness, and shows:
 *   M  momentary (400 ms window), S short-term (3 s window),
 *   I  integrated (running, absolute-gated at −70 LUFS; resets on each play),
 *   Pk true peak (dBTP, 4× oversampled) from the un-weighted master tap, max-held per play.
 *
 * Updates DOM text directly from the rAF loop (no React re-render per frame).
 * Approximations vs. a full meter: overlapping analyser windows, no relative
 * gating on the integrated value.
 */
const toLufs = (ms: number): number => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
const fmtLufs = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '−∞');
const fmtDb = (v: number): string => (Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(1) : '−∞');

// ── True peak: 4× oversampling via a windowed-sinc polyphase interpolator ─────
// (BS.1770-4 Annex 2 style). 3 inter-sample phases × 8 taps, Hann-windowed sinc.
const TP_PHASES = (() => {
  const phases: Float32Array[] = [];
  const TAPS = 8;
  for (let p = 1; p < 4; p++) {
    const frac = p / 4;
    const w = new Float32Array(TAPS);
    let sum = 0;
    for (let i = 0; i < TAPS; i++) {
      const x = i - (TAPS / 2 - 1) - frac;               // distance from the interpolation point
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const hann = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TAPS / 2));
      w[i] = sinc * hann; sum += w[i];
    }
    for (let i = 0; i < TAPS; i++) w[i] /= sum;          // unity DC gain
    phases.push(w);
  }
  return phases;
})();

/** Max absolute value of the 4×-oversampled signal (true peak, linear). */
function truePeakOf(buf: Float32Array): number {
  let max = 0;
  const TAPS = 8, HALF = TAPS / 2 - 1;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > max) max = v;
    if (i >= HALF && i + TAPS - HALF < buf.length) {
      for (const w of TP_PHASES) {
        let acc = 0;
        for (let t = 0; t < TAPS; t++) acc += w[t] * buf[i - HALF + t];
        const av = Math.abs(acc);
        if (av > max) max = av;
      }
    }
  }
  return max;
}

export function LoudnessMeter({ analysers, peak, playing }: {
  analysers: () => { l: AnalyserNode; r: AnalyserNode } | null;
  peak: () => AnalyserNode | null;
  playing: boolean;
}) {
  const mRef = useRef<HTMLSpanElement>(null);
  const sRef = useRef<HTMLSpanElement>(null);
  const iRef = useRef<HTMLSpanElement>(null);
  const pkRef = useRef<HTMLSpanElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    let raf = 0;
    let lBuf: Float32Array<ArrayBuffer> | null = null;
    let rBuf: Float32Array<ArrayBuffer> | null = null;
    let pBuf: Float32Array<ArrayBuffer> | null = null;
    const blocks: Array<{ t: number; ms: number }> = [];  // recent block mean-squares (≤3 s)
    let intSum = 0, intCount = 0;                          // integrated accumulator (gated)
    let peakMax = 0;                                       // max |sample| since play start
    let wasPlaying = false;
    let lastPaint = 0;

    const avgMsSince = (now: number, windowMs: number): number => {
      let sum = 0, n = 0;
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (now - blocks[i].t > windowMs) break;
        sum += blocks[i].ms; n++;
      }
      return n ? sum / n : 0;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = analysers();
      const now = performance.now();

      // reset the integrated/peak accumulators on each play (rising edge)
      if (playingRef.current && !wasPlaying) { intSum = 0; intCount = 0; peakMax = 0; blocks.length = 0; }
      wasPlaying = playingRef.current;

      if (a && !document.hidden) {
        const n = a.l.fftSize;
        if (!lBuf || lBuf.length !== n) { lBuf = new Float32Array(new ArrayBuffer(n * 4)); rBuf = new Float32Array(new ArrayBuffer(n * 4)); }
        a.l.getFloatTimeDomainData(lBuf); a.r.getFloatTimeDomainData(rBuf!);
        let sl = 0, sr = 0;
        for (let i = 0; i < n; i++) { sl += lBuf[i] * lBuf[i]; sr += rBuf![i] * rBuf![i]; }
        const blockMs = sl / n + sr / n;                  // sum of channel mean-squares (G=1)
        blocks.push({ t: now, ms: blockMs });
        while (blocks.length && now - blocks[0].t > 3000) blocks.shift();
        if (playingRef.current && toLufs(blockMs) > -70) { intSum += blockMs; intCount++; }  // absolute gate
      }

      const pa = peak();
      if (pa && !document.hidden) {
        const n = pa.fftSize;
        if (!pBuf || pBuf.length !== n) pBuf = new Float32Array(new ArrayBuffer(n * 4));
        pa.getFloatTimeDomainData(pBuf);
        const tp = truePeakOf(pBuf);                     // 4×-oversampled true peak
        if (tp > peakMax) peakMax = tp;
      }

      if (now - lastPaint > 100) {                        // repaint ~10 fps
        lastPaint = now;
        if (mRef.current) mRef.current.textContent = fmtLufs(toLufs(avgMsSince(now, 400)));
        if (sRef.current) sRef.current.textContent = fmtLufs(toLufs(avgMsSince(now, 3000)));
        if (iRef.current) iRef.current.textContent = fmtLufs(intCount ? toLufs(intSum / intCount) : -Infinity);
        if (pkRef.current) {
          const db = peakMax > 0 ? 20 * Math.log10(peakMax) : -Infinity;
          pkRef.current.textContent = fmtDb(db);
          pkRef.current.classList.toggle('clip', db > -1);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analysers, peak]);

  return (
    <div className="lufs">
      <div className="lufs-cell"><span className="lufs-k">M</span><span ref={mRef} className="lufs-v">−∞</span></div>
      <div className="lufs-cell"><span className="lufs-k">S</span><span ref={sRef} className="lufs-v">−∞</span></div>
      <div className="lufs-cell"><span className="lufs-k">I</span><span ref={iRef} className="lufs-v">−∞</span></div>
      <div className="lufs-cell"><span className="lufs-k">Pk</span><span ref={pkRef} className="lufs-v lufs-pk">−∞</span></div>
      <span className="lufs-unit">LUFS · dBTP peak</span>
    </div>
  );
}
