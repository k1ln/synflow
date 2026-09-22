import React, { useEffect, useRef, useState } from 'react';

const DB_MIN = -60;
/** dBFS → 0..1 bar position, with a gentle curve so the useful -24..0 range gets most of the width. */
const dbPos = (db: number) => Math.pow(Math.max(0, Math.min(1, (db - DB_MIN) / -DB_MIN)), 1.6);
const TICKS = [-48, -36, -24, -12, -6, 0];

/** Live level meter driven by a post-fader AnalyserNode. Shows a dB-scaled RMS fill
 *  (green→amber→red at -18/-6 dBFS) with tick marks, a held peak marker that falls
 *  after ~1.2 s, and a latching clip lamp (click it to reset). The analyser is
 *  fetched lazily via `analyser()` because the mixer strip may not be built until
 *  audio starts. */
export function Meter({ analyser, height = 8 }: { analyser: () => AnalyserNode | null; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [clipped, setClipped] = useState(false);
  const clipRef = useRef(false);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;
    let level = 0;           // smoothed RMS fill (0..1 position)
    let peak = 0;            // held peak position
    let holdUntil = 0;

    const draw = (now: number) => {
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
      const toDb = (a: number) => (a > 1e-5 ? 20 * Math.log10(a) : -120);
      const target = dbPos(toDb(rms));
      level += (target - level) * (target > level ? 0.6 : 0.1);   // fast attack, ballistic release
      const pkT = dbPos(toDb(pk));
      if (pkT >= peak) { peak = pkT; holdUntil = now + 1200; }
      else if (now > holdUntil) peak = Math.max(level, peak - 0.012);
      if (pk >= 0.999 && !clipRef.current) { clipRef.current = true; setClipped(true); }

      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(0, 0, w, h);
      // colour zones are fixed to the dB scale, so the bar reads the same at any level
      const grad = g.createLinearGradient(0, 0, w, 0);
      const z = (db: number) => dbPos(db);
      grad.addColorStop(0, '#2bd47a'); grad.addColorStop(z(-20), '#2bd47a');
      grad.addColorStop(z(-12), '#a6d83c'); grad.addColorStop(z(-6), '#f5c542'); grad.addColorStop(z(-1), '#ff5a5a');
      g.fillStyle = grad;
      g.fillRect(0, 0, w * level, h);
      // dB ticks
      g.fillStyle = 'rgba(0,0,0,.55)';
      for (const t of TICKS) g.fillRect(Math.round(w * dbPos(t)) - 1, 0, 1, h);
      if (peak > 0.01) {
        const x = Math.min(w - 2, w * peak);
        g.fillStyle = peak > dbPos(-0.5) ? '#ff5a5a' : 'rgba(255,255,255,.9)';
        g.fillRect(x, 0, 2, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <div className="meter-wrap" style={{ height }}>
      <canvas ref={ref} width={1440} height={height * 3} className="meter-canvas" style={{ width: '100%', height }} />
      <button className={`meter-clip ${clipped ? 'on' : ''}`} title={clipped ? 'Clipped — click to reset' : 'Clip indicator'}
        onClick={() => { clipRef.current = false; setClipped(false); }} />
    </div>
  );
}
