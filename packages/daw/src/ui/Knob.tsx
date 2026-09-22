import React, { useEffect, useRef, useState } from 'react';

/** Drag-interactive rotary knob (vertical drag), styled per the Mothscilla design. */
export function Knob({
  value = 0.5, onChange, color = 'var(--accent)', size = 44, label, readout, format, onLabelChange, defaultValue,
}: {
  /** Position (0..1) that double-click resets to. Falls back to the value at mount. */
  defaultValue?: number;
  value?: number;
  onChange?: (v: number) => void;
  color?: string;
  size?: number;
  label?: string;
  readout?: string;
  // Live value formatter: maps the knob's 0..1 position to a display string. When
  // set, the readout tracks the drag instantly (no parent re-render needed).
  format?: (v01: number) => string;
  // When set, the label becomes editable (double-click) and commits on blur/Enter.
  onLabelChange?: (label: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const initial = useRef(value);
  const vRef = useRef(v); vRef.current = v;
  const [active, setActive] = useState(false);
  const set = (nv: number) => { nv = Math.max(0, Math.min(1, nv)); setV(nv); onChange?.(nv); };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(label ?? ''); inputRef.current?.select(); } }, [editing, label]);
  const commit = () => { setEditing(false); const t = draft.trim(); if (t && t !== label) onLabelChange?.(t); };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    setActive(true);
    // Shift (or Cmd/Ctrl) = fine mode; re-anchor whenever the modifier flips so the value doesn't jump.
    let anchor = { y: e.clientY, v: vRef.current };
    let fine = false;
    const base = e.pointerType === 'touch' ? 0.004 : 0.006;
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      const f = ev.shiftKey || ev.metaKey || ev.ctrlKey;
      if (f !== fine) { fine = f; anchor = { y: ev.clientY, v: vRef.current }; }
      set(anchor.v + (anchor.y - ev.clientY) * base * (fine ? 0.1 : 1));
    };
    const up = () => {
      setActive(false);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const shown = format ? format(v) : readout;
  // Arc geometry: 270° sweep starting at 7:30, value arc drawn from the left stop
  // (or from center for bipolar defaults) up to the current position.
  const R = size / 2 - 3;
  const c = size / 2;
  const pt = (t: number, r = R) => { const a = ((225 - t * 270) * Math.PI) / 180; return [c + r * Math.cos(a), c - r * Math.sin(a)]; };
  const arc = (t0: number, t1: number) => {
    if (Math.abs(t1 - t0) < 0.002) return '';
    const [x0, y0] = pt(t0), [x1, y1] = pt(t1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${Math.abs(t1 - t0) * 270 > 180 ? 1 : 0} ${t1 > t0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const def = defaultValue ?? initial.current;
  const bipolar = Math.abs(def - 0.5) < 0.01;
  const [ix, iy] = pt(v, R - size * 0.08), [ox, oy] = pt(v, R - size * 0.34);
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.005 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(v + step); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(v - step); }
    else if (e.key === 'Home') { e.preventDefault(); set(0); }
    else if (e.key === 'End') { e.preventDefault(); set(1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(def); }
  };
  return (
    <div className={`knob-wrap ${active ? 'active' : ''}`}>
      <div
        className="knob" onPointerDown={onDown} onDoubleClick={() => set(def)} onKeyDown={onKey}
        title="Drag to adjust · Shift = fine · Double-click = reset"
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(v.toFixed(3))} aria-valuetext={shown}
        style={{ width: size, height: size, touchAction: 'none', ['--knob-c' as string]: color }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle className="knob-cap" cx={c} cy={c} r={R - size * 0.1} />
          <path className="knob-track" d={arc(0, 1)} />
          <path className="knob-value" d={arc(bipolar ? 0.5 : 0, v)} />
          <line className="knob-tick" x1={ix} y1={iy} x2={ox} y2={oy} />
        </svg>
        {active && shown !== undefined && <div className="knob-bubble">{shown}</div>}
      </div>
      {editing ? (
        <input ref={inputRef} className="knob-label-input" value={draft} spellCheck={false}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); }}
          onPointerDown={(e) => e.stopPropagation()} />
      ) : (
        label && <span className={`knob-label ${onLabelChange ? 'editable' : ''}`}
          title={onLabelChange ? 'Double-click to rename' : undefined}
          onDoubleClick={onLabelChange ? () => setEditing(true) : undefined}>{label}</span>
      )}
      {shown !== undefined && <span className="knob-readout">{shown}</span>}
    </div>
  );
}
