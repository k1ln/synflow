import React from 'react';

export interface Option {
  value: string | number;
  /** Short text shown when there is no symbol (or alongside one). */
  label?: string;
  /** Optional glyph (SVG element). Preferred over label when present. */
  symbol?: React.ReactNode;
  /** Hover tooltip. Defaults to label ?? String(value). */
  title?: string;
}

/**
 * Segmented "light-up" picker — the single-click replacement for an option
 * `<select>` on a flow node. The chosen segment lights up in the node's accent
 * color; no dropdown, no double interaction.
 *
 * Accent comes from the `--node-accent` CSS var (set per node by Flow.tsx). Pass
 * `accentColor` to override it locally (e.g. nodes that theme controls per row).
 */
export interface OptionSelectProps<T extends string | number = string | number> {
  value: T;
  onChange: (value: T) => void;
  options: Option[];
  /** Overrides the inherited --node-accent for this control. */
  accentColor?: string;
  /** Stack vertically instead of the default horizontal row. */
  vertical?: boolean;
  /** Lay buttons out in a fixed-column grid (e.g. 2 columns, 4 columns→2 rows). */
  columns?: number;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  'aria-label'?: string;
}

export function OptionSelect<T extends string | number = string | number>({
  value, onChange, options, accentColor, vertical, columns, className = '', style, disabled, ...rest
}: OptionSelectProps<T>) {
  const wrapStyle: React.CSSProperties = { ...(style || {}) };
  if (accentColor) (wrapStyle as any)['--node-accent'] = accentColor;
  if (columns) wrapStyle.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  return (
    <div
      className={`node-opts ${columns ? 'grid' : vertical ? 'vertical' : ''} ${className}`}
      role="group"
      style={wrapStyle}
      aria-label={rest['aria-label']}
    >
      {options.map((o) => {
        const on = o.value === value;
        // Glyph + caption together when both are given (e.g. filter shapes), so
        // the picture is backed by a readable abbreviation.
        const content = (o.symbol !== undefined && o.label !== undefined)
          ? <span className="node-opt-stack">{o.symbol}<span className="node-opt-cap">{o.label}</span></span>
          : (o.symbol ?? o.label ?? String(o.value));
        return (
          <button
            key={String(o.value)}
            type="button"
            className={`node-opt nodrag ${on ? 'on' : ''}`}
            title={o.title ?? o.label ?? String(o.value)}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => { if (!disabled) onChange(o.value as T); }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default OptionSelect;
