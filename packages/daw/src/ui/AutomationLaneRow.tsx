import React, { useRef } from 'react';

/** A paintable per-step automation lane: click/drag to set each step's value
 *  (height = value, mapped to [min,max]). Sample-and-hold playback. */
export function AutomationLaneRow({ values, min, max, onPaint }: {
  values: (number | null)[];
  min: number; max: number;
  onPaint: (step: number, value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const n = Math.max(1, values.length);
  const paint = (clientX: number, clientY: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const step = Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
    const v01 = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    onPaint(step, min + v01 * (max - min));
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    paint(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => paint(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const span = (max - min) || 1;
  return (
    <div className="aut-lane" ref={ref} onPointerDown={down} title="Click/drag to draw automation">
      {values.map((v, i) => {
        const v01 = v == null ? 0 : (v - min) / span;
        return <div key={i} className="aut-bar" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%`, height: `${Math.max(3, v01 * 100)}%` }} />;
      })}
    </div>
  );
}
