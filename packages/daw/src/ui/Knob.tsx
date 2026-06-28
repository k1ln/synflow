import React, { useEffect, useRef, useState } from 'react';

/** Drag-interactive rotary knob (vertical drag), styled per the Mothscilla design. */
export function Knob({
  value = 0.5, onChange, color = 'var(--accent)', size = 44, label, readout,
}: {
  value?: number;
  onChange?: (v: number) => void;
  color?: string;
  size?: number;
  label?: string;
  readout?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const set = (nv: number) => { setV(nv); onChange?.(nv); };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const start = { y: e.clientY, v };
    const move = (ev: PointerEvent) => set(Math.max(0, Math.min(1, start.v + (start.y - ev.clientY) * 0.006)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const angle = -135 + v * 270;
  return (
    <div className="knob-wrap">
      <div
        className="knob" onPointerDown={onDown} title="Drag to adjust"
        style={{ width: size, height: size, borderColor: color, boxShadow: `0 0 9px 1px color-mix(in srgb, ${color} 30%, transparent), inset 0 2px 4px rgba(0,0,0,.5)` }}
      >
        <div className="knob-rot" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="knob-ptr" style={{ height: size * 0.3, background: color, boxShadow: `0 0 5px ${color}` }} />
        </div>
      </div>
      {label && <span className="knob-label">{label}</span>}
      {readout !== undefined && <span className="knob-readout">{readout}</span>}
    </div>
  );
}
