import React, { useEffect, useRef, useState } from 'react';
import { X, Power, Trash2 } from 'lucide-react';
import { uid, type EqSettings, type EqBand } from '../model/project';
import { eqMagnitudeDb, logFreqs } from '../audio/eqResponse';

const FMIN = 20, FMAX = 20000, DBR = 18; // freq span + ±dB range
const GAIN_TYPES = new Set<BiquadFilterType>(['peaking', 'lowshelf', 'highshelf']);
const TYPES: BiquadFilterType[] = ['peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'notch', 'bandpass'];
const TYPE_LABEL: Record<string, string> = { peaking: 'Bell', lowshelf: 'Low shelf', highshelf: 'High shelf', lowpass: 'Low pass', highpass: 'High pass', notch: 'Notch', bandpass: 'Band pass' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);

/** Full-screen graphical parametric EQ: log-freq response curve over a live
 *  spectrum, click to add bands, drag handles, wheel for Q. */
export function EqEditor({ title, settings, sampleRate, getAnalyser, onChange, onClose }: {
  title: string;
  settings: EqSettings;
  sampleRate: number;
  getAnalyser: () => AnalyserNode | null;
  onChange: (s: EqSettings, commit: boolean) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<EqSettings>(settings);
  const [sel, setSel] = useState<string | null>(null);
  const sRef = useRef(s); sRef.current = s;
  const selRef = useRef(sel); selRef.current = sel;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 800, h: 360 });
  const accentRef = useRef('#00e676');

  // push a change to the live node (always) + the model (commit = on release)
  const apply = (next: EqSettings, commit: boolean) => { setS(next); sRef.current = next; onChange(next, commit); };
  const setBand = (id: string, patch: Partial<EqBand>, commit: boolean) =>
    apply({ ...sRef.current, bands: sRef.current.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }, commit);
  const removeBand = (id: string) => { apply({ ...sRef.current, bands: sRef.current.bands.filter((b) => b.id !== id) }, true); if (selRef.current === id) setSel(null); };

  useEffect(() => { accentRef.current = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00e676'; }, []);

  // geometry helpers (pixel space, from the current canvas size)
  const freqToX = (f: number, w: number) => (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * w;
  const xToFreq = (x: number, w: number) => FMIN * (FMAX / FMIN) ** (x / w);
  const dbToY = (db: number, h: number) => h / 2 - (db / DBR) * (h / 2 - 12);
  const yToDb = (y: number, h: number) => ((h / 2 - y) / (h / 2 - 12)) * DBR;
  const handleXY = (b: EqBand, w: number, h: number) => ({ x: freqToX(b.freq, w), y: dbToY(GAIN_TYPES.has(b.type) ? b.gain : 0, h) });

  // ── draw loop (curve + live spectrum) ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let raf = 0;
    const fit = () => {
      const r = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    };
    const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
    const spec = new Uint8Array(2048);

    const draw = () => {
      const g = canvas.getContext('2d'); if (!g) return;
      const dpr = window.devicePixelRatio || 1; const { w, h } = sizeRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const accent = accentRef.current;

      // grid
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px ui-monospace, monospace'; g.lineWidth = 1;
      for (const f of [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000]) {
        const x = freqToX(f, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
        if ([20, 100, 1000, 10000].includes(f)) g.fillText(fmtHz(f), x + 3, h - 4);
      }
      for (let db = -DBR + 6; db < DBR; db += 6) {
        const y = dbToY(db, h); g.strokeStyle = db === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        g.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 3);
      }

      // live spectrum (behind the curve)
      const an = getAnalyser();
      if (an) {
        const bins = Math.min(spec.length, an.frequencyBinCount); an.getByteFrequencyData(spec);
        g.beginPath(); g.moveTo(0, h);
        for (let i = 1; i < bins; i++) {
          const f = (i * sampleRate) / (an.fftSize); if (f < FMIN) continue; if (f > FMAX) break;
          const x = freqToX(f, w); const y = h - (spec[i] / 255) * h;
          g.lineTo(x, y);
        }
        g.lineTo(w, h); g.closePath();
        g.fillStyle = `color-mix(in srgb, ${accent} 16%, transparent)`; g.fill();
      }

      // response curve
      const N = Math.max(64, Math.round(w));
      const freqs = logFreqs(N); const mags = eqMagnitudeDb(sRef.current.on ? sRef.current.bands : [], freqs, sampleRate, sRef.current.outDb);
      g.beginPath();
      for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * w; const y = dbToY(clamp(mags[i], -DBR, DBR), h); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = sRef.current.on ? accent : 'rgba(255,255,255,0.3)'; g.lineWidth = 2; g.stroke();
      g.lineTo(w, dbToY(0, h)); g.lineTo(0, dbToY(0, h)); g.closePath();
      g.fillStyle = `color-mix(in srgb, ${accent} 10%, transparent)`; g.fill();

      // band handles
      for (const b of sRef.current.bands) {
        const { x, y } = handleXY(b, w, h); const on = b.on && sRef.current.on;
        g.beginPath(); g.arc(x, y, b.id === selRef.current ? 8 : 6, 0, Math.PI * 2);
        g.fillStyle = on ? accent : 'rgba(255,255,255,0.25)'; g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.5; g.stroke();
        if (b.id === selRef.current) { g.strokeStyle = accent; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke(); }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [sampleRate]); // geometry fns are stable; reads come from refs

  // ── pointer interaction ─────────────────────────────────────────────────────
  const drag = useRef<{ id: string } | null>(null);
  const localXY = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const hitBand = (x: number, y: number, w: number, h: number): EqBand | null => {
    for (const b of sRef.current.bands) { const p = handleXY(b, w, h); if (Math.hypot(p.x - x, p.y - y) <= 12) return b; }
    return null;
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y, w, h } = localXY(e);
    let b = hitBand(x, y, w, h);
    if (!b) { // click empty → add a bell here
      b = { id: uid('eqb'), type: 'peaking', freq: clamp(xToFreq(x, w), FMIN, FMAX), gain: clamp(yToDb(y, h), -DBR, DBR), q: 1, on: true };
      apply({ ...sRef.current, bands: [...sRef.current.bands, b] }, true);
    }
    setSel(b.id); drag.current = { id: b.id };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const { x, y, w, h } = localXY(e);
    const b = sRef.current.bands.find((z) => z.id === d.id); if (!b) return;
    const patch: Partial<EqBand> = { freq: clamp(xToFreq(x, w), FMIN, FMAX) };
    if (GAIN_TYPES.has(b.type)) patch.gain = clamp(yToDb(y, h), -DBR, DBR);
    setBand(d.id, patch, false);
  };
  const onUp = () => { if (drag.current) { onChange(sRef.current, true); drag.current = null; } };
  const onWheel = (e: React.WheelEvent) => {
    const { x, y, w, h } = localXY(e);
    const b = hitBand(x, y, w, h) ?? sRef.current.bands.find((z) => z.id === selRef.current); if (!b) return;
    e.preventDefault();
    setBand(b.id, { q: clamp(b.q * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.1, 18) }, true);
  };
  const onDouble = (e: React.MouseEvent) => { const { x, y, w, h } = localXY(e); const b = hitBand(x, y, w, h); if (b) removeBand(b.id); };

  const selBand = s.bands.find((b) => b.id === sel) ?? null;

  return (
    <div className="syn-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="eq-modal">
        <div className="eq-head">
          <span className="syn-dot" />
          <span className="eq-title">{title} — Equalizer</span>
          <button className={`eq-bypass ${s.on ? 'on' : ''}`} title={s.on ? 'EQ on' : 'EQ bypassed'} onClick={() => apply({ ...s, on: !s.on }, true)}><Power size={13} /> {s.on ? 'On' : 'Bypassed'}</button>
          <label className="eq-out">out
            <input type="range" min={-12} max={12} step={0.5} value={s.outDb} onChange={(e) => apply({ ...s, outDb: parseFloat(e.target.value) }, true)} />
            <span>{s.outDb > 0 ? '+' : ''}{s.outDb.toFixed(1)}</span>
          </label>
          <button className="syn-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="eq-canvas-wrap">
          <canvas ref={canvasRef} className="eq-canvas"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={onWheel} onDoubleClick={onDouble} onContextMenu={(e) => { e.preventDefault(); onDouble(e); }} />
          <div className="eq-hint">click to add a band · drag to move · wheel = Q · double-click to remove</div>
        </div>

        <div className="eq-bands">
          {s.bands.length === 0 && <span className="eq-empty">No bands yet — click the graph to add one.</span>}
          {s.bands.map((b) => (
            <button key={b.id} className={`eq-chip ${b.id === sel ? 'sel' : ''} ${b.on ? '' : 'off'}`} onClick={() => setSel(b.id)}>
              {TYPE_LABEL[b.type]} · {fmtHz(b.freq)}Hz{GAIN_TYPES.has(b.type) ? ` · ${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)}dB` : ''}
            </button>
          ))}
        </div>

        {selBand && (
          <div className="eq-inspect">
            <label>type
              <select value={selBand.type} onChange={(e) => setBand(selBand.id, { type: e.target.value as BiquadFilterType }, true)}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label>freq<input type="number" min={FMIN} max={FMAX} value={Math.round(selBand.freq)} onChange={(e) => setBand(selBand.id, { freq: clamp(+e.target.value || FMIN, FMIN, FMAX) }, true)} /></label>
            {GAIN_TYPES.has(selBand.type) && <label>gain<input type="number" min={-DBR} max={DBR} step={0.5} value={selBand.gain} onChange={(e) => setBand(selBand.id, { gain: clamp(+e.target.value, -DBR, DBR) }, true)} /></label>}
            <label>Q<input type="number" min={0.1} max={18} step={0.1} value={selBand.q} onChange={(e) => setBand(selBand.id, { q: clamp(+e.target.value || 0.1, 0.1, 18) }, true)} /></label>
            <button className={`eq-band-on ${selBand.on ? 'on' : ''}`} onClick={() => setBand(selBand.id, { on: !selBand.on }, true)} title="Band on/off"><Power size={12} /></button>
            <button className="eq-band-del" onClick={() => removeBand(selBand.id)} title="Remove band"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
