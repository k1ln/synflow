import { useEffect, useRef } from 'react';

/** Master spectrum analyzer: log-frequency FFT bars (30 Hz–20 kHz) with a falling
 *  peak-hold per band. Reads a raw AnalyserNode each frame (lazy getter, since the
 *  mixer strip may not exist until audio starts). Pairs with the LUFS meter. */
const BANDS = 56;
const F_MIN = 30, F_MAX = 20000;

export function SpectrumAnalyzer({ analyser, height = 60 }: { analyser: () => AnalyserNode | null; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    let raf = 0;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    const peaks = new Float32Array(BANDS);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const an = analyser();
      const w = c.width, h = c.height;
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, 0, w, h);
      if (!an || document.hidden) return;
      const n = an.frequencyBinCount;
      if (!bins || bins.length !== n) bins = new Uint8Array(new ArrayBuffer(n));
      an.getByteFrequencyData(bins);
      const binHz = (an.context.sampleRate / 2) / n;
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#8fb996'); grad.addColorStop(0.6, '#8fb4d9'); grad.addColorStop(0.85, '#c4ab7d'); grad.addColorStop(1, '#c95c5c');
      const bw = w / BANDS;
      for (let b = 0; b < BANDS; b++) {
        const f0 = F_MIN * Math.pow(F_MAX / F_MIN, b / BANDS);
        const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (b + 1) / BANDS);
        const i0 = Math.max(0, Math.floor(f0 / binHz)), i1 = Math.min(n - 1, Math.ceil(f1 / binHz));
        let max = 0;
        for (let i = i0; i <= i1; i++) if (bins[i] > max) max = bins[i];
        const val = max / 255;
        const x = b * bw;
        g.fillStyle = grad;
        g.fillRect(x + 0.5, h - val * h, Math.max(1, bw - 1), val * h);
        peaks[b] = val > peaks[b] ? val : Math.max(0, peaks[b] - 0.02);
        if (peaks[b] > 0.02) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 0.5, h - peaks[b] * h - 1.5, Math.max(1, bw - 1), 1.5); }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <canvas ref={ref} width={320} height={height} className="spectrum-canvas" style={{ width: '100%', height }} />;
}
