import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader, Music2, Waves, Package, Globe } from 'lucide-react';
import type { LibraryEntry } from '../synflow/library';
import type { PoolItem } from '../model/project';
import { fetchGalleryIndex, downloadVstai, galleryShotUrl, type GalleryItem } from '../synflow/vstai';

/** What the user picked in the browser dialog. */
export type PluginPick =
  | { kind: 'pool'; poolId: string }                       // instrument already in the project
  | { kind: 'library'; entry: LibraryEntry }               // built-in / on-disk Synflow flow
  | { kind: 'gallery'; item: GalleryItem; doc: any };      // downloaded VibeSynth .vstai

/**
 * Plugin browser: a detailed popup for adding instruments or effects. Three
 * sources side by side — instruments already in the project pool, the Synflow
 * library, and the public VibeSynth (VibePlugin) gallery of AI-built plugins
 * (with thumbnail, description and parameter count; downloaded on pick).
 */
export function AddPluginDialog({ mode, title, library, pool, onPick, onClose }: {
  mode: 'instrument' | 'effect';
  title: string;
  library: LibraryEntry[];
  pool?: PoolItem[];            // shown for instruments (reuse without duplicating)
  onPick: (pick: PluginPick) => void | Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [galleryError, setGalleryError] = useState('');
  const [busy, setBusy] = useState('');          // slug being downloaded

  useEffect(() => {
    let dead = false;
    fetchGalleryIndex()
      .then((list) => { if (!dead) setItems(list); })
      .catch((e) => { if (!dead) setGalleryError(e?.message || String(e)); });
    return () => { dead = true; };
  }, []);

  const needle = q.trim().toLowerCase();
  const match = (...hay: (string | undefined)[]) => !needle || hay.some((h) => h?.toLowerCase().includes(needle));

  const libItems = useMemo(() => library.filter((e) => match(e.name, e.category, e.kind)), [library, needle]);
  const poolItems = useMemo(() => (pool ?? []).filter((p) => match(p.name)), [pool, needle]);
  const galleryItems = useMemo(
    () => (items ?? []).filter((it) => (mode === 'instrument' ? it.isInstrument : !it.isInstrument) && match(it.name, it.explanation)),
    [items, needle, mode],
  );

  const pickGallery = async (it: GalleryItem) => {
    if (busy) return;
    setBusy(it.slug);
    try {
      const doc = await downloadVstai(it.slug, it.id);
      await onPick({ kind: 'gallery', item: it, doc });
      onClose();
    } catch (e) {
      setGalleryError((e as Error)?.message || String(e));
    } finally { setBusy(''); }
  };

  return (
    <div className="syn-overlay" onClick={onClose}>
      <div className="plg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plg-head">
          <span className="plg-title">{title}</span>
          <label className="plg-search"><Search size={13} /><input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="syn-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className="plg-body">
          {poolItems.length > 0 && (
            <section className="plg-section">
              <h3 className="plg-sect"><Package size={12} /> In this project</h3>
              <div className="plg-grid">
                {poolItems.map((p) => (
                  <button key={p.id} className="plg-card" onClick={() => { void onPick({ kind: 'pool', poolId: p.id }); onClose(); }}>
                    <span className="plg-card-name">{p.name}</span>
                    <span className={`plg-badge ${p.kind}`}>{p.kind}</span>
                    <span className="plg-card-desc">Already loaded — add another use of it to this track.</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="plg-section">
            <h3 className="plg-sect"><Music2 size={12} /> Synflow library</h3>
            <div className="plg-grid">
              {libItems.length === 0 && <span className="plg-none">nothing matches</span>}
              {libItems.map((e) => (
                <button key={e.id} className="plg-card" onClick={() => { void onPick({ kind: 'library', entry: e }); onClose(); }}>
                  <span className="plg-card-name">{e.name}</span>
                  <span className={`plg-badge ${e.kind ?? 'fx'}`}>{e.kind ?? 'fx'}</span>
                  <span className="plg-card-desc">{e.category ? `${e.category} · ` : ''}Synflow node-graph {mode === 'instrument' ? 'instrument' : 'effect'} — editable in the flow editor.</span>
                </button>
              ))}
            </div>
          </section>

          <section className="plg-section">
            <h3 className="plg-sect"><Globe size={12} /> VibeSynth gallery <span className="plg-sub">AI-built plugins · vibeplugin</span></h3>
            {items === null && !galleryError && <div className="plg-loading"><Loader size={14} className="spin" /> Loading gallery…</div>}
            {galleryError && <div className="plg-error">{galleryError}</div>}
            <div className="plg-grid gallery">
              {galleryItems.map((it) => (
                <button key={it.slug} className={`plg-card gallery ${busy === it.slug ? 'busy' : ''}`} disabled={!!busy} onClick={() => void pickGallery(it)}>
                  <span className="plg-shot" style={{ backgroundImage: `url(${galleryShotUrl(it.id)})` }} />
                  <span className="plg-card-name">{it.name}</span>
                  <span className={`plg-badge ${it.isInstrument ? 'synth' : 'fx'}`}>{it.isInstrument ? 'synth' : 'fx'}</span>
                  <span className="plg-card-desc">{it.explanation || 'AI-generated plugin from the VibeSynth gallery.'}</span>
                  <span className="plg-card-meta"><Waves size={11} /> {it.params ?? 0} parameters · wasm DSP{busy === it.slug ? ' · downloading…' : ''}</span>
                </button>
              ))}
              {items !== null && galleryItems.length === 0 && !galleryError && <span className="plg-none">nothing matches</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
