import React, { useRef, useEffect } from "react";

export const CustomNumberInput: React.FC<{
  style?: React.CSSProperties;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
}> = ({ style, value, min = 1, max = 300, step = 1, onChange }) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const valueRef = useRef(value);
  const deltaRef = useRef(0);
  useEffect(() => { valueRef.current = value; }, [value]);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      onChange(Math.max(min, Math.min(max, val)));
    }
  };

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const applyDelta = (delta: number) => {
    const next = clamp(Math.round(valueRef.current + delta));
    valueRef.current = next;
    onChange(next);
  };

  const handleArrow = (delta: number) => {
    deltaRef.current = deltaRef.current <= 0
      ? Math.min(deltaRef.current, -1)
      : Math.max(deltaRef.current, 1);
    applyDelta(deltaRef.current);
  };

  const startHold = (delta: number) => {
    deltaRef.current = delta;
    handleArrow(delta);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        deltaRef.current = deltaRef.current + deltaRef.current*0.05;
        handleArrow(delta);
      }, 20); // repeat every 70ms
    }, 400); // initial delay before repeat
  };

  const stopHold = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };
  
  return (
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onPointerDown={e => { e.preventDefault(); startHold(step); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onTouchStart={e => { e.preventDefault(); startHold(step); }}
        onTouchEnd={stopHold}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "#222",
          color: "inherit",
          width: 20,
          height: 20,
          fontSize: 16,
          cursor: "pointer",
          padding: 0,
        }}
        tabIndex={-1}
      >
        ▲
      </button>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          const ctrl = e.ctrlKey || e.metaKey;
          let delta = 0;
          if (e.key === 'ArrowUp') delta = ctrl ? 100 : 1;
          if (e.key === 'ArrowDown') delta = ctrl ? -100 : -1;
          if (e.key === 'ArrowRight') delta = ctrl ? 1000 : 10;
          if (e.key === 'ArrowLeft') delta = ctrl ? -1000 : -10;
          if (delta !== 0) {
            e.preventDefault();
            applyDelta(delta);
          }
        }}
        style={{
          width: 60,
          textAlign: "center",
          margin: "0 4px",
          border: "1px solid #888",
          borderRadius: 3,
          background: "#222",
          fontSize: 14,
          color: "inherit",
        }}
      />
      <button
        type="button"
        onPointerDown={e => { e.preventDefault(); startHold(-step); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onTouchStart={e => { e.preventDefault(); startHold(-step); }}
        onTouchEnd={stopHold}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "#222",
          color: "inherit",
          width: 20,
          height: 20,
          fontSize: 16,
          cursor: "pointer",
          padding: 0,
        }}
        tabIndex={-1}
      >
        ▼
      </button>
    </div>
  );
};