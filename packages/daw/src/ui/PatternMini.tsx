import React, { useEffect, useRef } from 'react';
import { patternContent, patternLengthOf, type Track } from '../model/project';

const MAX_BUF_W = 4096; // backing-buffer cap; CSS stretches to the real display width
const MAX_STEPS = 8192; // stop drawing cells past here (a song-long loop clip stays cheap)

/** A tiny preview of a drum/synth pattern painted on its song-arrangement clip,
 *  the way audio clips show a waveform. The pattern restarts at the clip, so it
 *  draws from step 0 and tiles across the clip's span. Drum hits = a cell per
 *  instrument row; synth notes = short streaks placed by pitch. */
export function PatternMini({ track, patternId, barSteps, clipSlots, width, height, color = '#8fb4d9' }: {
  track: Track;
  patternId?: string;   // pattern the clip plays (default: track's first/active)
  barSteps: number;     // steps per bar (project.totalSteps)
  clipSlots: number;    // how many bars the clip spans
  width: number;        // display width in px
  height: number;
  color?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const buf = Math.min(MAX_BUF_W, Math.max(1, Math.round(width * dpr)));
  const bufH = Math.max(1, Math.round(height * dpr));
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    g.clearRect(0, 0, buf, bufH);
    const len = patternLengthOf(track, patternId);
    const clipSteps = Math.max(1, Math.round(clipSlots * barSteps)); // pattern steps the clip spans
    const draw = Math.min(clipSteps, MAX_STEPS);
    const cw = buf / clipSteps;
    g.fillStyle = color;
    if (track.type === 'drums') {
      const rows = track.uses.map((u) => ({ u, steps: patternContent(track, patternId, u.id).steps })).filter((r) => r.steps && r.steps.length);
      if (!rows.length) return;
      const rh = bufH / rows.length;
      rows.forEach(({ steps: st }, r) => {
        const steps = st!;
        const y = Math.round(r * rh + rh * 0.2), ch = Math.max(1, Math.round(rh * 0.6));
        for (let k = 0; k < draw; k++) {
          if (steps[k % len]) { const x0 = Math.round((k / clipSteps) * buf + Math.min(cw * 0.12, dpr)); g.fillRect(x0, y, Math.max(1, Math.round(cw * 0.76)), ch); }
        }
      });
    } else {
      const notes = track.uses.flatMap((u) => patternContent(track, patternId, u.id).notes ?? []);
      if (!notes.length) return;
      let lo = Infinity, hi = -Infinity;
      for (const n of notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
      const span = Math.max(1, hi - lo);
      const pad = 2 * dpr, nh = 2 * dpr;
      const reps = Math.ceil(draw / len);
      for (let rp = 0; rp < reps; rp++) {
        for (const n of notes) {
          const k = rp * len + n.start;
          if (k >= clipSteps) continue;
          const x = Math.round((k / clipSteps) * buf);
          const w = Math.max(1, Math.round((Math.min(n.length, clipSteps - k) / clipSteps) * buf));
          const y = Math.round(pad + (1 - (n.midi - lo) / span) * (bufH - 2 * pad - nh));
          g.fillRect(x, y, w, nh);
        }
      }
    }
  }, [track, patternId, barSteps, clipSlots, buf, bufH, dpr, color]);
  return <canvas ref={ref} width={buf} height={bufH} style={{ display: 'block', width, height, imageRendering: 'pixelated' }} />;
}
