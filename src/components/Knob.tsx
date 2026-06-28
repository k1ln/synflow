import React, { useEffect, useRef, useState } from 'react';

/** Drag-interactive rotary knob (vertical drag) for the Live UI panel.
 *  Ported from the DAW so Synflow's instrument panel matches Mothscilla. */
export function Knob({
  value = 0.5, onChange, color = '#6ee7a8', size = 44, label, readout, format, onLabelChange, defaultValue,
}: {
  value?: number;
  onChange?: (v: number) => void;
  color?: string;
  size?: number;
  label?: string;
  readout?: string;
  // Live value formatter: maps the knob's 0..1 position to a display string so
  // the readout tracks the drag instantly (no parent re-render needed).
  format?: (v01: number) => string;
  // When set, the label becomes editable (double-click) and commits on blur/Enter.
  onLabelChange?: (label: string) => void;
  // Double-click the knob to reset to this 0..1 position (knob convention).
  defaultValue?: number;
}) {
  const [v, setV] = useState(value);
  const vRef = useRef(value);
  useEffect(() => { setV(value); vRef.current = value; }, [value]);
  const set = (nv: number) => { const c = Math.max(0, Math.min(1, nv)); setV(c); vRef.current = c; onChange?.(c); };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(label ?? ''); inputRef.current?.select(); } }, [editing, label]);
  const commit = () => { setEditing(false); const t = draft.trim(); if (t && t !== label) onLabelChange?.(t); };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = 'none';
    const start = { y: e.clientY, v };
    const baseSens = e.pointerType === 'touch' ? 0.004 : 0.006;
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      // Shift = fine control.
      const sensitivity = ev.shiftKey ? baseSens * 0.2 : baseSens;
      set(start.v + (start.y - ev.clientY) * sensitivity);
    };
    const up = () => {
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Wheel adjust (Shift = fine). Native non-passive so preventDefault works.
  const knobElRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = knobElRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      const step = (ev.shiftKey ? 0.005 : 0.03) * (ev.deltaY < 0 ? 1 : -1);
      set(vRef.current + step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDoubleClick = (e: React.MouseEvent) => {
    if (defaultValue === undefined) return;
    e.preventDefault(); e.stopPropagation();
    set(defaultValue);
  };

  const angle = -135 + v * 270;
  const shown = format ? format(v) : readout;
  return (
    <div className="lui-knob-wrap">
      <div
        ref={knobElRef}
        className="lui-knob" onPointerDown={onDown} onDoubleClick={onDoubleClick}
        title={defaultValue !== undefined ? 'Drag to adjust · Shift = fine · scroll · double-click resets' : 'Drag to adjust · Shift = fine · scroll'}
        style={{ width: size, height: size, touchAction: 'none', borderColor: color, boxShadow: `0 0 9px 1px color-mix(in srgb, ${color} 30%, transparent), inset 0 2px 4px rgba(0,0,0,.5)` }}
      >
        <div className="lui-knob-rot" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="lui-knob-ptr" style={{ height: size * 0.3, background: color, boxShadow: `0 0 5px ${color}` }} />
        </div>
      </div>
      {editing ? (
        <input ref={inputRef} className="lui-knob-label-input" value={draft} spellCheck={false}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); }}
          onPointerDown={(e) => e.stopPropagation()} />
      ) : (
        label && <span className={`lui-knob-label ${onLabelChange ? 'editable' : ''}`}
          title={onLabelChange ? 'Double-click to rename' : undefined}
          onDoubleClick={onLabelChange ? () => setEditing(true) : undefined}>{label}</span>
      )}
      {shown !== undefined && <span className="lui-knob-readout">{shown}</span>}
    </div>
  );
}
