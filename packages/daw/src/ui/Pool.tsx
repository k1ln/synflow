import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderPlus, Music2, Drum, Sparkles, Radio, X, Play, Square, Plus, AudioWaveform } from 'lucide-react';
import type { PoolItem, AudioAsset } from '../model/project';
import type { LibraryEntry } from '../synflow/library';

const SECTION = {
  Instruments: { color: 'var(--cat-mod)', icon: Music2 },
  Drums: { color: 'var(--cat-source)', icon: Drum },
  Effects: { color: 'var(--cat-fx)', icon: Sparkles },
  Recordings: { color: 'var(--cat-out, #4ad)', icon: AudioWaveform },
} as const;

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * The project pool (left panel): instruments + drums loaded for this project
 * (click → live mode) and the effects available to add. "Add from folder" pulls
 * more flows in from the on-disk library.
 */
export function Pool({ pool, effects, instrumentLib, armed, recordings, previewKey, onPreview, onPlaceRecording, onRemoveRecording, onOpenInstrument, onEditEffect, onRemoveInstrument, onRemoveEffect, onAddFromFolder, onAddInstrument, onNewEffect, source }: {
  pool: PoolItem[];
  effects: LibraryEntry[];
  instrumentLib: LibraryEntry[];   // the on-disk/bundled instruments you can add to the pool
  armed?: string | null;
  recordings: AudioAsset[];
  previewKey: string | null;
  onPreview: (assetId: string) => void;
  onPlaceRecording: (assetId: string) => void;
  onRemoveRecording: (assetId: string) => void;
  onOpenInstrument: (poolId: string) => void;
  onEditEffect: (effectId: string) => void;
  onRemoveInstrument: (poolId: string) => void;
  onRemoveEffect: (effectId: string) => void;
  onAddFromFolder: () => void;
  onAddInstrument?: (entry: LibraryEntry) => void;
  onNewEffect?: () => void;
  source?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Instruments: true, Drums: true, Effects: true, Recordings: true });
  const [adding, setAdding] = useState<null | 'synth' | 'drum'>(null);
  const synths = pool.filter((p) => p.kind === 'synth');
  const drums = pool.filter((p) => p.kind === 'drum');
  // Library instruments not already in the project pool, split by kind, for the "add a new" picker.
  const isDrum = (e: LibraryEntry) => e.kind === 'step' || (e.kind !== 'piano' && e.category === 'Drums');
  const inPool = (libId: string) => pool.some((p) => p.libId === libId);
  const synthCand = instrumentLib.filter((e) => !isDrum(e) && !inPool(e.id));
  const drumCand = instrumentLib.filter((e) => isDrum(e) && !inPool(e.id));

  // NOTE: section/item are plain render functions (called as `section({...})`), NOT
  // <Section/> components. Defining components inside Pool gives them a new identity
  // each render, so React would REMOUNT the whole list every render — and since the
  // app re-renders on every playback step, the pool list would tear down ~10×/s and
  // flicker on hover. Called as functions, their output reconciles in place.
  const section = ({ name, count, onNew, newTitle, menu, children }: { name: keyof typeof SECTION; count: number; onNew?: () => void; newTitle?: string; menu?: React.ReactNode; children: React.ReactNode }) => {
    const { color } = SECTION[name];
    const isOpen = open[name] ?? true;
    return (
      <div>
        <div className="browser-group-row">
          <button className="browser-group" onClick={() => setOpen((o) => ({ ...o, [name]: !isOpen }))}>
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="bg-name" style={{ color }}>{name}</span>
            <span className="bg-count">{count}</span>
          </button>
          {onNew && <button className="bg-new" title={newTitle ?? 'New'} onClick={onNew}><Plus size={12} /></button>}
          {menu}
        </div>
        {isOpen && children}
      </div>
    );
  };

  // The "add a new" dropdown for the instrument/drum sections: pick an existing
  // library instrument to add to the project pool.
  const addMenu = (which: 'synth' | 'drum', cand: LibraryEntry[]) => adding !== which ? null : (
    <div className="pool-addmenu" onMouseLeave={() => setAdding(null)}>
      {cand.length === 0 && <span className="te-none">all {which === 'synth' ? 'instruments' : 'drums'} added</span>}
      {cand.map((e) => <button key={e.id} onClick={() => { onAddInstrument?.(e); setAdding(null); }}>{e.name}</button>)}
    </div>
  );

  const item = ({ id, name, color, live, onClick, onRemove, tag, title }: { id: string; name: string; color: string; live?: boolean; onClick?: () => void; onRemove?: () => void; tag?: string; title?: string }) => (
    <div key={id} className={`browser-item ${live ? 'live' : ''}`} onClick={onClick} title={title}>
      <span className="bi-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="bi-name">{name}</span>
      {live && <Radio size={11} className="bi-live" />}
      {tag && <span className="bi-kind">{tag}</span>}
      {onRemove && <button className="bi-del" title="Remove from project" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={12} /></button>}
    </div>
  );

  return (
    <div className="browser">
      <div className="browser-head">
        <span className="browser-title">Project pool</span>
        <button className="browser-addfolder" onClick={onAddFromFolder} title="Add flows from a folder"><FolderPlus size={14} /></button>
      </div>
      <div className="browser-list">
        {section({ name: 'Instruments', count: synths.length, onNew: () => setAdding((a) => (a === 'synth' ? null : 'synth')), newTitle: 'Add an instrument to the project', menu: addMenu('synth', synthCand), children: (
          <>
            {synths.map((p) => item({ id: p.id, name: p.name, color: SECTION.Instruments.color, live: armed === p.id, onClick: () => onOpenInstrument(p.id), onRemove: () => onRemoveInstrument(p.id), title: 'Open instrument (live + knobs)' }))}
            {synths.length === 0 && <div className="browser-empty">none — add with + (or a whole folder above)</div>}
          </>
        ) })}
        {section({ name: 'Drums', count: drums.length, onNew: () => setAdding((a) => (a === 'drum' ? null : 'drum')), newTitle: 'Add a drum to the project', menu: addMenu('drum', drumCand), children: (
          <>
            {drums.map((p) => item({ id: p.id, name: p.name, color: SECTION.Drums.color, live: armed === p.id, onClick: () => onOpenInstrument(p.id), onRemove: () => onRemoveInstrument(p.id), title: 'Open instrument (live + knobs)' }))}
            {drums.length === 0 && <div className="browser-empty">none — add with + (or a whole folder above)</div>}
          </>
        ) })}
        {section({ name: 'Effects', count: effects.length, onNew: onNewEffect, newTitle: 'Create a new effect in Synflow', children: (
          <>
            {effects.map((e) => item({ id: e.id, name: e.name, color: SECTION.Effects.color, tag: 'edit', onClick: () => onEditEffect(e.id), onRemove: () => onRemoveEffect(e.id), title: 'Edit effect in Synflow' }))}
            {effects.length === 0 && <div className="browser-empty">none — add from folder or +</div>}
          </>
        ) })}
        {section({ name: 'Recordings', count: recordings.length, children: (
          <>
          {recordings.map((a) => {
            const playing = previewKey === 'asset:' + a.id;
            return (
              <div key={a.id} className="rec-item" title={a.name}>
                <button className={`rec-play ${playing ? 'on' : ''}`} title={playing ? 'Stop' : 'Preview'} onClick={() => onPreview(a.id)}>
                  {playing ? <Square size={11} /> : <Play size={11} />}
                </button>
                <span className="rec-name">{a.name}</span>
                <span className="rec-dur">{fmtDur(a.duration)}</span>
                <button className="rec-add" title="Place on the selected audio track at the playhead" onClick={() => onPlaceRecording(a.id)}><Plus size={12} /></button>
                <button className="bi-del" title="Delete recording" onClick={() => onRemoveRecording(a.id)}><X size={12} /></button>
              </div>
            );
          })}
          {recordings.length === 0 && <div className="browser-empty">none — record or import on an audio track</div>}
          </>
        ) })}
      </div>
      <div className="browser-foot"><Music2 size={14} /><span>{source ?? 'built-in'}</span></div>
    </div>
  );
}
