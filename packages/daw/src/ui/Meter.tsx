import React, { useEffect, useRef } from 'react';

/** Live level meter driven by a post-fader AnalyserNode. Reads the time-domain
 *  signal each frame, shows an RMS fill (green→amber→red) with a falling peak-hold
 *  tick. The analyser is fetched lazily via `analyser()` because the mixer strip
 *  may not be built until audio starts. */
export function Meter({ analyser, height = 8 }: { analyser: () => AnalyserNode | null; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;
    let peak = 0;          // smoothed peak-hold position (0..1)
    let level = 0;         // smoothed RMS fill (0..1)

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = c.width, h = c.height;
      const an = analyser();
      let rms = 0, pk = 0;
      if (an && !document.hidden) {
        if (!buf || buf.length !== an.fftSize) buf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = buf[i]; sum += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
        rms = Math.sqrt(sum / buf.length);
      }
      // map amplitude to a friendlier visual range, then smooth (fast attack, slow release)
      const target = Math.min(1, rms * 3.2);
      level += (target - level) * (target > level ? 0.5 : 0.12);
      const pkT = Math.min(1, pk * 3.2);
      peak = pkT > peak ? pkT : Math.max(level, peak - 0.015);

      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(0, 0, w, h);
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#2bd47a');
      grad.addColorStop(0.7, '#2bd47a');
      grad.addColorStop(0.85, '#f5c542');
      grad.addColorStop(1, '#ff5a5a');
      g.fillStyle = grad;
      g.fillRect(0, 0, w * level, h);
      if (peak > 0.01) {                       // peak-hold tick
        const x = Math.min(w - 1.5, w * peak);
        g.fillStyle = peak > 0.96 ? '#ff5a5a' : 'rgba(255,255,255,.85)';
        g.fillRect(x, 0, 1.5, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return <canvas ref={ref} width={240} height={height} className="meter-canvas" style={{ width: '100%', height }} />;
}
