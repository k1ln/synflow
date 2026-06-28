import React, { useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import type { FxInsert } from '../model/project';
import { findEntry, type LibraryEntry } from '../synflow/library';
import { flowKnobs, knob01, knobValue } from '../synflow/knobs';
import { Knob } from './Knob';

/** A horizontal FX chain editor (used at instrument / track / master level).
 *  Each insert is a device card with its Synflow-exported knobs. */
export function FxBar({ label, color, fx, effects, onAdd, onRemove, onEdit, onKnob, compact }: {
  label: string;
  color?: string;
  fx: FxInsert[];
  effects: LibraryEntry[];
  onAdd: (fxId: string) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number) => void;
  onKnob?: (index: number, nodeId: string, param: string, value: number) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const c = color ?? 'var(--cat-fx)';
  return (
    <div className={`fxbar ${compact ? 'compact' : ''}`}>
      <span className="fxbar-label" style={{ color: c }}>{label}</span>
      <div className="fxbar-row">
        {fx.length === 0 && <span className="fxbar-empty">no fx</span>}
        {fx.map((ins, i) => {
          const knobs = flowKnobs(ins.flow ?? findEntry(ins.fxId)?.flow);
          return (
            <div className="fxdev" key={ins.id} style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}>
              <div className="fxdev-head">
                <span className="fxdev-name" style={{ color: c }}>{ins.name}</span>
                <button className="fxbar-icon" title="Edit in Synflow" onClick={() => onEdit(i)}><Pencil size={11} /></button>
                <button className="fxbar-icon" title="Remove" onClick={() => onRemove(i)}><X size={11} /></button>
              </div>
              {knobs.length > 0 && (
                <div className="fxdev-knobs">
                  {knobs.map((k) => (
                    <Knob
                      key={`${k.nodeId}.${k.param}`} value={knob01(k)} color={c} size={34} label={k.label}
                      onChange={onKnob ? (v) => onKnob(i, k.nodeId, k.param, knobValue(k, v)) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
