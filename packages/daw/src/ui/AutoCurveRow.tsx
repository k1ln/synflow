import React, { useRef } from 'react';
import type { AutoPoint } from '../model/project';

/** Timeline automation curve editor (one lane), aligned with the song timeline:
 *  click empty space to add a point, drag a point to move it, double-click a
 *  point to delete it. Values map bottom→top over [min,max]; segments are the
 *  exact linear ramps the engine schedules. */
export function AutoCurveRow({ points, min, max, totalSteps, onChange }: {
  points: AutoPoint[];
  min: number; max: number;
  totalSteps: number;         // song length in steps (x axis)
  onChange: (points: AutoPoint[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const span = (max - min) || 1;
  const toXY = (p: AutoPoint) => ({ x: (p.step / Math.max(1, totalSteps)) * 100, y: (1 - (p.value - min) / span) * 100 });
  const fromEvent = (clientX: number, clientY: number): AutoPoint => {
    const r = ref.current!.getBoundingClientRect();
    const step = Math.max(0, Math.min(totalSteps, ((clientX - r.left) / r.width) * totalSteps));
    const v01 = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    return { step, value: min + v01 * span };
  };
  const sorted = (pts: AutoPoint[]) => [...pts].sort((a, b) => a.step - b.step);

  const dragPoint = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    // Keep the array UNSORTED while dragging so `idx` stays stable (the closure
    // over `points` is stale across moves); sort once on release.
    let last = points;
    const mv = (ev: PointerEvent) => {
      const np = fromEvent(ev.clientX, ev.clientY);
      last = points.map((p, i) => (i === idx ? np : p));
      onChange(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      onChange(sorted(last));
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const addPoint = (e: React.PointerEvent) => {
    if (e.button !== 0 || !ref.current) return;
    onChange(sorted([...points, fromEvent(e.clientX, e.clientY)]));
  };

  const pts = sorted(points);
  const poly = pts.length
    ? `0,${toXY(pts[0]).y} ` + pts.map((p) => `${toXY(p).x},${toXY(p).y}`).join(' ') + ` 100,${toXY(pts[pts.length - 1]).y}`
    : '';

  return (
    <div className="autocurve" ref={ref} onPointerDown={addPoint} title="Click to add a point · drag to move · double-click a point to delete">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {poly && <polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
      </svg>
      {pts.map((p, i) => {
        const { x, y } = toXY(p);
        return (
          <span key={i} className="autocurve-pt" style={{ left: `${x}%`, top: `${y}%` }}
            onPointerDown={(e) => dragPoint(e, points.indexOf(p))}
            onDoubleClick={(e) => { e.stopPropagation(); if (points.length > 1) onChange(points.filter((q) => q !== p)); }} />
        );
      })}
    </div>
  );
}
