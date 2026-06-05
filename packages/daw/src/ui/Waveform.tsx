import React, { useEffect, useRef } from 'react';
import type { Peaks } from '../audio/waveform';

const MAX_CANVAS_W = 4096; // backing-buffer cap; CSS stretches to the real display width

export function Waveform({
  peaks, width = 600, height = 80, color = '#4ade80', background = '#0e0e10',
  loop,
}: {
  peaks: Peaks | null;
  width?: number;
  height?: number;
  color?: string;
  background?: string;
  /** Optional loop/selection region in [0,1] of the width. */
  loop?: { start: number; end: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // A long audio clip can ask for a display width of tens of thousands of px,
  // which blows past the browser's max canvas size and renders as a broken
  // image. Draw into a capped backing buffer and let CSS stretch it to `width`.
  const buf = Math.min(MAX_CANVAS_W, Math.max(1, Math.round(width)));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, buf, height);
    g.fillStyle = background;
    g.fillRect(0, 0, buf, height);

    if (loop) {
      g.fillStyle = 'rgba(74,222,128,0.12)';
      g.fillRect(loop.start * buf, 0, (loop.end - loop.start) * buf, height);
    }
    if (peaks && peaks.buckets > 0) {
      const mid = height / 2;
      const bw = Math.max(1, buf / peaks.buckets);
      g.fillStyle = color;
      for (let b = 0; b < peaks.buckets; b++) {
        const x = (b / peaks.buckets) * buf;
        const yTop = mid - peaks.max[b] * mid;
        const h = Math.max(1, (peaks.max[b] - peaks.min[b]) * mid);
        g.fillRect(x, yTop, bw, h);
      }
    }
    // zero line
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(0, height / 2); g.lineTo(buf, height / 2); g.stroke();
  }, [peaks, buf, height, color, background, loop]);

  return <canvas ref={ref} width={buf} height={height} style={{ display: 'block', width, height, borderRadius: 4 }} />;
}
