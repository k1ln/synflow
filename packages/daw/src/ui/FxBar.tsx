import React, { useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import type { FxInsert } from '../model/project';
import type { LibraryEntry } from '../synflow/library';

/** A horizontal FX chain editor, reused at instrument / track / master level. */
export function FxBar({ label, color, fx, effects, onAdd, onRemove, onEdit, compact }: {
  label: string;
  color?: string;
  fx: FxInsert[];
  effects: LibraryEntry[];
  onAdd: (fxId: string) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const c = color ?? 'var(--cat-fx)';
  return (
    <div className={`fxbar ${compact ? 'compact' : ''}`}>
      <span className="fxbar-label" style={{ color: c }}>{label}</span>
      <div className="fxbar-row">
        {fx.length === 0 && <span className="fxbar-empty">no fx</span>}
        {fx.map((ins, i) => (
          <span className="fxbar-chip" key={ins.id} style={{ borderColor: `color-mix(in srgb, ${c} 50%, transparent)` }}>
            <span className="fxbar-name">{ins.name}</span>
            <button className="fxbar-icon" title="Edit in Synflow" onClick={() => onEdit(i)}><Pencil size={11} /></button>
            <button className="fxbar-icon" title="Remove" onClick={() => onRemove(i)}><X size={11} /></button>
          </span>
        ))}
        <div className="fxbar-add">
          <button className="fxbar-addbtn" onClick={() => setPicking((p) => !p)} title="Add effect"><Plus size={14} /></button>
          {picking && (
            <div className="fxbar-menu" onMouseLeave={() => setPicking(false)}>
              {effects.length === 0 && <span className="fxbar-none">no effects loaded</span>}
              {effects.map((e) => <button key={e.id} onClick={() => { onAdd(e.id); setPicking(false); }}>{e.name}</button>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
