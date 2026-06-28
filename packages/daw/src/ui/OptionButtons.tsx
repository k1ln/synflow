import React from 'react';
import type { ExposedOption } from '../synflow/knobs';

/** A host-exposed discrete param ("option button") rendered as a small segmented
 *  control — the DAW counterpart of the option <select>/buttons on a Synflow node.
 *  Picking a choice sends the raw string value through the same setParam path as knobs. */
export function OptionButtons({ opt, color, onChange, compact }: {
  opt: ExposedOption;
  color: string;
  onChange?: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`fxopt ${compact ? 'compact' : ''}`}>
      <span className="fxopt-label" title={opt.label}>{opt.label}</span>
      <div className="fxopt-btns" role="group" aria-label={opt.label}>
        {opt.choices.map((c) => {
          const on = c.value === opt.value;
          return (
            <button key={c.value} className={`fxopt-btn ${on ? 'on' : ''}`} title={c.label}
              style={on ? { color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}
              onClick={onChange ? () => onChange(c.value) : undefined}>{c.label}</button>
          );
        })}
      </div>
    </div>
  );
}
