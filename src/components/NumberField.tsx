import React, { useEffect, useRef, useState } from 'react';

/**
 * Numeric text field for flow nodes.
 *
 * `<input type="number">` is deliberately avoided — inside React Flow it is buggy
 * (scroll-to-change hijacks canvas zoom, the spinner steals drag focus, and the
 * browser fights controlled re-renders). Instead this is a `type="text"` input
 * with `inputMode="decimal"` that keeps a free-form *draft* string while focused
 * so you can type intermediate states like "", "-", "1." without the value
 * snapping to NaN. It only parses, clamps and commits on blur or Enter.
 *
 * - While focused: the user's raw keystrokes are shown verbatim.
 * - On blur / Enter: parse → clamp to [min,max] → round to `precision` → commit.
 *   Empty/invalid reverts to the last committed value (or `min`/0).
 * - When not focused: mirrors the external `value` (so knob/MIDI/automation moves
 *   are reflected live in the text — per design we show the value here, not in
 *   the knob).
 * - ↑/↓ nudge by `step` (×10 with Shift) and commit immediately.
 */
export interface NumberFieldProps {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  /** Decimal places to display after commit. Omit to keep the parsed number as-is. */
  precision?: number;
  /** Arrow-key / wheel step. Defaults to 1. */
  step?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Width in px (shortcut for style.width). */
  width?: number;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}

const fmt = (n: number, precision?: number) =>
  precision === undefined ? String(n) : n.toFixed(precision);

export const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  precision,
  step = 1,
  className = 'node-input',
  style,
  width,
  disabled,
  title,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(() => fmt(value, precision));
  const lastValid = useRef<number>(Number.isFinite(value) ? value : 0);

  // Mirror external changes only while not actively editing.
  useEffect(() => {
    if (Number.isFinite(value)) lastValid.current = value;
    if (!focused) setDraft(fmt(value, precision));
  }, [value, precision, focused]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (raw.trim() === '' || isNaN(n)) {
      // revert
      setDraft(fmt(lastValid.current, precision));
      return;
    }
    const c = clamp(n);
    lastValid.current = c;
    setDraft(fmt(c, precision));
    onCommit(c);
  };

  const nudge = (dir: 1 | -1, big: boolean) => {
    const base = Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : lastValid.current;
    const delta = step * (big ? 10 : 1) * dir;
    const c = clamp(base + delta);
    lastValid.current = c;
    setDraft(fmt(c, precision));
    onCommit(c);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      pattern="-?[0-9]*\.?[0-9]*"
      disabled={disabled}
      title={title}
      value={focused ? draft : fmt(value, precision)}
      className={`nodrag ${className}`}
      style={width !== undefined ? { width, ...style } : style}
      onFocus={() => { setFocused(true); setDraft(fmt(value, precision)); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
        else if (e.key === 'Escape') { setDraft(fmt(value, precision)); (e.target as HTMLInputElement).blur(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1, e.shiftKey); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1, e.shiftKey); }
      }}
    />
  );
};

export default NumberField;
