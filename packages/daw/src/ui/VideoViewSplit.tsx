import React, { useRef, useState } from 'react';
import { Columns2, GripHorizontal, GripVertical, Rows2 } from 'lucide-react';

interface SplitState { orient: 'stacked' | 'side'; pct: number } // pct = monitor's share, 0..1
const DEFAULT_SPLIT: SplitState = { orient: 'stacked', pct: 0.68 };
const KEY = 'mothscilla:videosplit';
const load = (): SplitState => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_SPLIT, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_SPLIT;
};
const save = (s: SplitState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

/** Layout for the Video tab: the monitor and the arrangement, with a draggable
 *  divider between them and a button to flip between stacked (monitor over
 *  arrangement) and side-by-side. The orient button sits off to one corner —
 *  not dead center — so it never steals a drag that starts from the middle of
 *  the bar, which is where you'd naturally grab it. */
export function VideoViewSplit({ monitor, arrange }: { monitor: React.ReactNode; arrange: React.ReactNode }) {
  const [split, setSplit] = useState<SplitState>(load);
  const wrapRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef(split); splitRef.current = split;

  const onDragStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const cursorClass = splitRef.current.orient === 'side' ? 'resizing-col' : 'resizing-row';
    document.body.classList.add(cursorClass);
    const move = (ev: PointerEvent) => {
      const wrap = wrapRef.current; if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const frac = splitRef.current.orient === 'side' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      const pct = Math.max(0.15, Math.min(0.85, frac));
      const next = { ...splitRef.current, pct };
      splitRef.current = next; setSplit(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      document.body.classList.remove(cursorClass);
      save(splitRef.current);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const toggleOrient = () => setSplit((s) => { const next = { ...s, orient: (s.orient === 'side' ? 'stacked' : 'side') as SplitState['orient'] }; save(next); return next; });

  return (
    <div className={`video-view ${split.orient === 'side' ? 'side' : ''}`} ref={wrapRef}>
      <div className="video-view-pane" style={{ flexBasis: `${split.pct * 100}%` }}>{monitor}</div>
      <div className="video-view-splitter" onPointerDown={onDragStart} title="Drag to resize">
        <span className="video-view-grip">{split.orient === 'side' ? <GripVertical size={11} /> : <GripHorizontal size={11} />}</span>
        <button className="video-view-orient" title={split.orient === 'side' ? 'Stack monitor above arrangement' : 'Place monitor beside arrangement'}
          onPointerDown={(e) => e.stopPropagation()} onClick={toggleOrient}>
          {split.orient === 'side' ? <Columns2 size={12} /> : <Rows2 size={12} />}
        </button>
      </div>
      <div className="video-view-pane arrange">{arrange}</div>
    </div>
  );
}
