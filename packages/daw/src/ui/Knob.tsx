import React, { useEffect, useRef, useState } from 'react';

/** Drag-interactive rotary knob (vertical drag), styled per the Mothscilla design. */
export function Knob({
  value = 0.5, onChange, color = 'var(--accent)', size = 44, label, readout, format, onLabelChange,
}: {
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
  const set = (nv: number) => { setV(nv); onChange?.(nv); };

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
    const start = { y: e.clientY, v };
    const sensitivity = e.pointerType === 'touch' ? 0.004 : 0.006;
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      set(Math.max(0, Math.min(1, start.v + (start.y - ev.clientY) * sensitivity)));
    };
    const up = () => {
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

  const angle = -135 + v * 270;
  const shown = format ? format(v) : readout;
  return (
    <div className="knob-wrap">
      <div
        className="knob" onPointerDown={onDown} title="Drag to adjust"
        style={{ width: size, height: size, touchAction: 'none', borderColor: color }}
      >
        <div className="knob-rot" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="knob-ptr" style={{ height: size * 0.3, background: color }} />
        </div>
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
