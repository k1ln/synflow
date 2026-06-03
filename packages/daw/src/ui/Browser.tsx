import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight, Music } from 'lucide-react';
import { LIBRARY, type LibraryEntry } from '../synflow/library';

const CAT_COLOR: Record<string, string> = {
  Drums: 'var(--cat-source)', Synths: 'var(--cat-mod)', Filter: 'var(--cat-fx)', Effects: 'var(--cat-fx)',
};

/** Library browser: lists the editable flow files; click adds to the selected track. */
export function Browser({ onAdd, entries = LIBRARY, source }: {
  onAdd?: (entry: LibraryEntry) => void;
  entries?: LibraryEntry[];
  source?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ Drums: true, Synths: true, Filter: true });
  const [sel, setSel] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCat: Record<string, LibraryEntry[]> = {};
    for (const e of entries) {
      if (q && !e.name.toLowerCase().includes(q)) continue;
      (byCat[e.category] ??= []).push(e);
    }
    return Object.entries(byCat);
  }, [query, entries]);

  return (
    <div className="browser">
      <div className="browser-search">
        <Search size={14} />
        <input
          className="browser-search-input" placeholder="Search the library…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="browser-list">
        {groups.map(([cat, items]) => {
          const color = CAT_COLOR[cat] ?? 'var(--cat-source)';
          const isOpen = open[cat] ?? true;
          return (
            <div key={cat}>
              <button className="browser-group" onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="bg-name">{cat}</span>
                <span className="bg-count">{items.length}</span>
              </button>
              {isOpen && items.map((e) => (
                <div
                  key={e.id} className={`browser-item ${sel === e.id ? 'sel' : ''}`}
                  title={`${e.group === 'effect' ? 'Add effect' : 'Add instrument'} to selected track`}
                  onClick={() => { setSel(e.id); onAdd?.(e); }}
                >
                  <span className="bi-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span className="bi-name">{e.name}</span>
                  <span className="bi-kind">{e.group === 'effect' ? 'fx' : e.kind === 'piano' ? 'synth' : 'drum'}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="browser-foot"><Music size={14} /><span>{source ?? 'flows/'} · {entries.length} flows</span></div>
    </div>
  );
}
