import React, { useEffect, useRef } from 'react';
import type { RollView } from './PianoRoll';

/** A paintable per-step automation lane: click/drag to set each step's value
 *  (height = value, mapped to [min,max]). Sample-and-hold playback.
 *  When `view` is given (the track's piano roll is on screen), the lane is sized
 *  to the SAME px-per-step and total length as the note lane above it, and its
 *  scroll follows along — so steps stay lined up as you scroll/zoom the notes. */
export function AutomationLaneRow({ values, min, max, onPaint, view }: {
  values: (number | null)[];
  min: number; max: number;
  onPaint: (step: number, value: number) => void;
  view?: RollView;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const n = Math.max(1, values.length);
  const paint = (clientX: number, clientY: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    // Same px/step as the bars' own positions (view.px when aligned to a piano roll,
    // else the container's own width/n) so the hit-test always matches what's drawn.
    const step = view
      ? Math.max(0, Math.min(n - 1, Math.floor((clientX - r.left) / view.px)))
      : Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
    const v01 = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    onPaint(step, min + v01 * (max - min));
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    paint(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => paint(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  // Follow the piano roll's scroll position (one-way: the notes lead, this follows).
  useEffect(() => { if (scrollRef.current && view) scrollRef.current.scrollLeft = view.scrollLeft; }, [view?.scrollLeft]);
  const span = (max - min) || 1;
  const width = view ? Math.max(1, view.disp) * view.px : undefined;
  const lane = (
    <div className="aut-lane" ref={ref} onPointerDown={down} title="Click/drag to draw automation" style={width ? { width, minWidth: width } : undefined}>
      {values.map((v, i) => {
        const v01 = v == null ? 0 : (v - min) / span;
        // Absolute px (matching the note lane's px/step) when aligned to a piano roll,
        // else the plain percentage fill used when there's nothing to line up with.
        const pos = view ? { left: i * view.px, width: view.px } : { left: `${(i / n) * 100}%`, width: `${100 / n}%` };
        return <div key={i} className="aut-bar" style={{ ...pos, height: `${Math.max(3, v01 * 100)}%` }} />;
      })}
    </div>
  );
  return width ? <div className="aut-lane-scroll" ref={scrollRef}>{lane}</div> : lane;
}
