import React, { useEffect, useRef } from 'react';
import type { Track } from '../model/project';

const MAX_BUF_W = 4096; // backing-buffer cap; CSS stretches to the real display width
const MAX_STEPS = 8192; // stop drawing cells past here (a song-long loop clip stays cheap)

/** A tiny preview of a drum/synth pattern painted on its song-arrangement clip,
 *  the way audio clips show a waveform. The pattern restarts at the clip, so it
 *  draws from step 0 and tiles across the clip's span. Drum hits = a cell per
 *  instrument row; synth notes = short streaks placed by pitch. */
export function PatternMini({ track, barSteps, clipSlots, width, height, color = '#7cc4ff' }: {
  track: Track;
  barSteps: number;     // steps per bar (project.totalSteps)
  clipSlots: number;    // how many bars the clip spans
  width: number;        // display width in px
  height: number;
  color?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const buf = Math.min(MAX_BUF_W, Math.max(1, Math.round(width)));
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    g.clearRect(0, 0, buf, height);
    const len = Math.max(1, track.length);
    const clipSteps = Math.max(1, Math.round(clipSlots * barSteps)); // pattern steps the clip spans
    const draw = Math.min(clipSteps, MAX_STEPS);
    const cw = buf / clipSteps;
    g.fillStyle = color;
    if (track.type === 'drums') {
      const rows = track.uses.filter((u) => u.steps && u.steps.length);
      if (!rows.length) return;
      const rh = height / rows.length;
      rows.forEach((u, r) => {
        const steps = u.steps!;
        const y = r * rh + rh * 0.2, ch = Math.max(1, rh * 0.6);
        for (let k = 0; k < draw; k++) {
          if (steps[k % len]) g.fillRect((k / clipSteps) * buf + Math.min(cw * 0.12, 1), y, Math.max(1, cw * 0.76), ch);
        }
      });
    } else {
      const notes = track.uses.flatMap((u) => u.notes ?? []);
      if (!notes.length) return;
      let lo = Infinity, hi = -Infinity;
      for (const n of notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
      const span = Math.max(1, hi - lo);
      const pad = 2, nh = 2;
      const reps = Math.ceil(draw / len);
      for (let rp = 0; rp < reps; rp++) {
        for (const n of notes) {
          const k = rp * len + n.start;
          if (k >= clipSteps) continue;
          const x = (k / clipSteps) * buf;
          const w = Math.max(1, (Math.min(n.length, clipSteps - k) / clipSteps) * buf);
          const y = pad + (1 - (n.midi - lo) / span) * (height - 2 * pad - nh);
          g.fillRect(x, y, w, nh);
        }
      }
    }
  }, [track, barSteps, clipSlots, buf, height, color]);
  return <canvas ref={ref} width={buf} height={height} style={{ display: 'block', width, height }} />;
}
