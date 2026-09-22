import React, { useEffect, useRef, useState } from 'react';

const PPS = 60;      // pixels of waveform per second of recording
const COL = 2;       // px per column

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** Live waveform of the take being recorded. Grows left→right at a fixed scale
 *  (so you see how long/loud it gets) and scrolls once it fills the strip. */
export function RecordingMonitor({ analyser, startMs }: { analyser: AnalyserNode; startMs: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState({ t: 0, db: -Infinity, maxDb: -Infinity });

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    const buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    const cols: number[] = [];
    let raf = 0, maxPk = 0, lastStat = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      analyser.getFloatTimeDomainData(buf);
      let pk = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; }
      const t = (now - startMs) / 1000;
      const idx = Math.max(0, Math.floor((t * PPS) / COL));
      while (cols.length <= idx) cols.push(0);
      cols[idx] = Math.max(cols[idx], pk);
      if (pk > maxPk) maxPk = pk;

      g.clearRect(0, 0, w, h);
      const mid = h / 2;
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, mid, w, 1);
      const visible = Math.floor(w / COL);
      const first = Math.max(0, cols.length - visible);
      for (let i = first; i < cols.length; i++) {
        const a = Math.min(1, cols[i]);
        const bh = Math.max(1, a * (h - 6));
        g.fillStyle = a > 0.99 ? '#ff5a5a' : a > 0.5 ? '#f5c542' : '#ff7a7a';
        g.fillRect((i - first) * COL, mid - bh / 2, COL - 0.5, bh);
      }
      if (now - lastStat > 100) {
        lastStat = now;
        const db = (a: number) => (a > 1e-5 ? 20 * Math.log10(a) : -Infinity);
        setStats({ t, db: db(pk), maxDb: db(maxPk) });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, startMs]);

  const f = (d: number) => (Number.isFinite(d) ? `${d.toFixed(1)} dB` : '-∞ dB');
  return (
    <div className="recmon">
      <div className="recmon-head">
        <span className="recmon-dot" />
        <span className="recmon-title">Recording</span>
        <span className="recmon-time">{fmt(stats.t)}</span>
        <span className="recmon-stat">peak <b className={stats.maxDb >= -0.5 ? 'clip' : ''}>{f(stats.maxDb)}</b></span>
      </div>
      <canvas ref={cv} className="recmon-canvas" />
    </div>
  );
}
