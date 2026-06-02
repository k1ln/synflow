import React, { useEffect, useRef } from 'react';
import type { Peaks } from '../audio/waveform';

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
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, width, height);
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);

    if (loop) {
      g.fillStyle = 'rgba(74,222,128,0.12)';
      g.fillRect(loop.start * width, 0, (loop.end - loop.start) * width, height);
    }
    if (peaks && peaks.buckets > 0) {
      const mid = height / 2;
      const bw = Math.max(1, width / peaks.buckets);
      g.fillStyle = color;
      for (let b = 0; b < peaks.buckets; b++) {
        const x = (b / peaks.buckets) * width;
        const yTop = mid - peaks.max[b] * mid;
        const h = Math.max(1, (peaks.max[b] - peaks.min[b]) * mid);
        g.fillRect(x, yTop, bw, h);
      }
    }
    // zero line
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(0, height / 2); g.lineTo(width, height / 2); g.stroke();
  }, [peaks, width, height, color, background, loop]);

  return <canvas ref={ref} width={width} height={height} style={{ display: 'block', borderRadius: 4 }} />;
}
