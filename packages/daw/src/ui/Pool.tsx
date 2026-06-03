import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderPlus, Music2, Drum, Sparkles, Radio } from 'lucide-react';
import type { PoolItem } from '../model/project';
import type { LibraryEntry } from '../synflow/library';

const SECTION = {
  Instruments: { color: 'var(--cat-mod)', icon: Music2 },
  Drums: { color: 'var(--cat-source)', icon: Drum },
  Effects: { color: 'var(--cat-fx)', icon: Sparkles },
} as const;

/**
 * The project pool (left panel): instruments + drums loaded for this project
 * (click → live mode) and the effects available to add. "Add from folder" pulls
 * more flows in from the on-disk library.
 */
export function Pool({ pool, effects, armed, onLive, onAddFromFolder, source }: {
  pool: PoolItem[];
  effects: LibraryEntry[];
  armed?: string | null;
  onLive: (poolId: string) => void;
  onAddFromFolder: () => void;
  source?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Instruments: true, Drums: true, Effects: true });
  const synths = pool.filter((p) => p.kind === 'synth');
  const drums = pool.filter((p) => p.kind === 'drum');

  const Section = ({ name, count, children }: { name: keyof typeof SECTION; count: number; children: React.ReactNode }) => {
    const { color } = SECTION[name];
    const isOpen = open[name] ?? true;
    return (
      <div>
        <button className="browser-group" onClick={() => setOpen((o) => ({ ...o, [name]: !isOpen }))}>
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="bg-name" style={{ color }}>{name}</span>
          <span className="bg-count">{count}</span>
        </button>
        {isOpen && children}
      </div>
    );
  };

  const Item = ({ id, name, color, live, onClick, tag }: { id: string; name: string; color: string; live?: boolean; onClick?: () => void; tag?: string }) => (
    <div className={`browser-item ${live ? 'live' : ''}`} onClick={onClick} title={onClick ? 'Click to play live' : name}>
      <span className="bi-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="bi-name">{name}</span>
      {live && <Radio size={11} className="bi-live" />}
      {tag && <span className="bi-kind">{tag}</span>}
    </div>
  );

  return (
    <div className="browser">
      <div className="browser-head">
        <span className="browser-title">Project pool</span>
        <button className="browser-addfolder" onClick={onAddFromFolder} title="Add flows from a folder"><FolderPlus size={14} /></button>
      </div>
      <div className="browser-list">
        <Section name="Instruments" count={synths.length}>
          {synths.map((p) => <Item key={p.id} id={p.id} name={p.name} color={SECTION.Instruments.color} live={armed === p.id} onClick={() => onLive(p.id)} />)}
          {synths.length === 0 && <div className="browser-empty">none — add from folder</div>}
        </Section>
        <Section name="Drums" count={drums.length}>
          {drums.map((p) => <Item key={p.id} id={p.id} name={p.name} color={SECTION.Drums.color} live={armed === p.id} onClick={() => onLive(p.id)} />)}
          {drums.length === 0 && <div className="browser-empty">none — add from folder</div>}
        </Section>
        <Section name="Effects" count={effects.length}>
          {effects.map((e) => <Item key={e.id} id={e.id} name={e.name} color={SECTION.Effects.color} tag="fx" />)}
          {effects.length === 0 && <div className="browser-empty">none — add from folder</div>}
        </Section>
      </div>
      <div className="browser-foot"><Music2 size={14} /><span>{source ?? 'built-in'}</span></div>
    </div>
  );
}
