import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import { fetchGalleryIndex, downloadVstai, galleryShotUrl, type GalleryItem } from '../host/vstaiGallery';
import './AudioNode.css';

// AiVstFlowNode — loads a VibePlugin ".vstai" (an "AI VST": DSP written by Claude,
// compiled to WASM) and hosts it as a Synflow node. The .vstai carries the compiled
// `wasmBase64`, its params, and an isInstrument flag; we embed those in node.data so
// the native engine's VstaiNode renders it (audio in / MIDI in / audio out) straight
// into the DAW. Both stacks run their DSP under wasmtime, so no VST3 hosting and no
// recompilation is needed — we just ship the bytes. A .vstai comes from a local file
// or the public VibePlugin gallery (Browse…), downloaded on demand.
//
// The module's params are declared as `data.knobs` so they surface as host-automatable
// controls in the plugin's play panel; instrument modules also get isTrigger/isPitch
// so the flow's host-MIDI path drives noteOn/noteOff + pitch.

export type VstaiParamMeta = { param: string; label: string; min: number; max: number; default: number };

export type AiVstFlowNodeData = {
  label?: string;
  vstaiName?: string;
  wasmBase64?: string;
  isInstrument?: boolean;
  knobs?: VstaiParamMeta[];
  onChange?: (data: any) => void;
  style?: React.CSSProperties;
  [k: string]: any; // paramN live values, isTrigger/isPitch/pitchParam/frequency/isInput
};

const AiVstFlowNode: React.FC<{ data: AiVstFlowNodeData }> = ({ data }) => {
  const [name, setName] = useState<string>(data.vstaiName || '');
  const [isInstrument, setIsInstrument] = useState<boolean>(!!data.isInstrument);
  const [knobs, setKnobs] = useState<VstaiParamMeta[]>(data.knobs || []);
  const [status, setStatus] = useState<string>(data.wasmBase64 ? 'loaded' : '');
  const [, forceRender] = useState(0);
  const onChangeRef = useRef(data.onChange);
  useEffect(() => { onChangeRef.current = data.onChange; }, [data.onChange]);

  // Gallery browser state.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [galleryError, setGalleryError] = useState<string>('');
  const [search, setSearch] = useState('');
  const [busySlug, setBusySlug] = useState<string>('');

  const push = (next: AiVstFlowNodeData) => {
    onChangeRef.current?.(next);
    // Native plugin: NativeFlowEngine listens for 'worklet.compiled' and re-pushes the
    // flow JSON to C++, so a freshly loaded .vstai (or a param tweak) hot-reloads in the
    // running engine. Deferred a frame so the node/data update has landed in nodesRef.
    if (typeof window !== 'undefined')
      requestAnimationFrame(() => { try { EventBus.getInstance().emit('worklet.compiled', { nodeId: (data as any).id }); } catch { /* noop */ } });
  };

  // Embed a parsed .vstai document into node.data (shared by file-load and gallery).
  const applyVstaiDoc = (doc: any, fallbackName: string) => {
    if (!doc || typeof doc !== 'object' || !doc.wasmBase64) throw new Error('not a .vstai (no wasmBase64)');
    const instrument = !!doc.isInstrument;
    const params: any[] = Array.isArray(doc.params) ? doc.params : [];
    const nextKnobs: VstaiParamMeta[] = params.map((p) => ({
      param: `param${p.index}`,
      label: String(p.name ?? `Param ${p.index}`),
      min: Number(p.min ?? 0),
      max: Number(p.max ?? 1),
      default: Number(p.default ?? 0),
    }));

    const next: AiVstFlowNodeData = { ...data };
    next.vstaiName = String(doc.name ?? fallbackName);
    next.wasmBase64 = String(doc.wasmBase64);
    next.isInstrument = instrument;
    next.knobs = nextKnobs;
    for (const p of params) next[`param${p.index}`] = Number(p.value ?? p.default ?? 0);
    if (instrument) {
      next.isTrigger = true; next.isPitch = true; next.pitchParam = 'frequency';
      if (next.frequency == null) next.frequency = 220;
      delete next.isInput;
    } else {
      // Effect insert: host audio flows into it (the flow's audio input).
      next.isInput = true;
      delete next.isTrigger; delete next.isPitch; delete next.pitchParam;
    }

    setName(next.vstaiName!); setIsInstrument(instrument); setKnobs(nextKnobs);
    setStatus(`loaded ✓ ${instrument ? 'synth' : 'fx'} · ${params.length} params`);
    push(next);
  };

  const loadFile = async (file: File) => {
    try {
      setStatus('reading…');
      applyVstaiDoc(JSON.parse(await file.text()), file.name.replace(/\.vstai$/i, ''));
    } catch (e: any) {
      setStatus('error: ' + (e?.message || String(e)));
    }
  };

  const openGallery = () => {
    setGalleryOpen(true);
    if (items === null && !galleryError) {
      fetchGalleryIndex()
        .then((list) => setItems(list))
        .catch((e) => setGalleryError(e?.message || String(e)));
    }
  };

  const pickFromGallery = async (it: GalleryItem) => {
    try {
      setBusySlug(it.slug || it.id);
      const doc = await downloadVstai(it.slug || it.id);
      applyVstaiDoc(doc, it.name);
      setGalleryOpen(false);
    } catch (e: any) {
      setGalleryError(`Load “${it.name}” failed: ${e?.message || String(e)}`);
    } finally {
      setBusySlug('');
    }
  };

  const setParamValue = (param: string, value: number) => {
    (data as any)[param] = value;              // reflect immediately for the slider
    forceRender((n) => n + 1);
    push({ ...data, [param]: value });
  };

  const q = search.trim().toLowerCase();
  const filtered = (items || []).filter((it) =>
    !q || it.name.toLowerCase().includes(q) || (it.explanation || '').toLowerCase().includes(q));

  return (
    <div className="flow-node" style={data.style}>
      <div className="node-title">AI VST</div>

      {/* audio in (effects) + audio out */}
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />

      <div className="node-field" style={{ alignItems: 'stretch', gap: 4 }}>
        <div className="node-row" style={{ gap: 4 }}>
          <button className="node-btn nodrag" style={{ flex: 1 }} onClick={openGallery}>Browse gallery…</button>
          <label className="node-btn nodrag" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
            {name ? 'File…' : 'Load file…'}
            <input
              type="file"
              accept=".vstai,application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.currentTarget.value = ''; }}
            />
          </label>
        </div>
        {name && (
          <div style={{ fontSize: 11, color: 'var(--node-fg, #cfe0ff)' }}>
            <b>{name}</b> <span style={{ opacity: 0.6 }}>{isInstrument ? '· synth (MIDI)' : '· fx (audio in)'}</span>
          </div>
        )}
        {status && <div style={{ fontSize: 10, opacity: 0.7 }}>{status}</div>}
      </div>

      {knobs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, marginTop: 6 }}>
          {knobs.map((k) => {
            const v = Number((data as any)[k.param] ?? k.default);
            return (
              <div key={k.param} className="node-field" style={{ alignItems: 'center' }}>
                <span className="node-label" style={{ fontSize: 9 }} title={k.label}>{k.label}</span>
                <input
                  type="range"
                  className="nodrag"
                  min={k.min} max={k.max} step={(k.max - k.min) / 100 || 0.01}
                  value={v}
                  onChange={(e) => setParamValue(k.param, parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: 9, opacity: 0.7 }}>{v.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}

      {galleryOpen && (
        <GalleryModal
          items={filtered}
          total={items?.length ?? null}
          loading={items === null && !galleryError}
          error={galleryError}
          search={search}
          busySlug={busySlug}
          onSearch={setSearch}
          onPick={pickFromGallery}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </div>
  );
};

// Full-viewport modal (fixed, escapes the React Flow canvas transform).
const GalleryModal: React.FC<{
  items: GalleryItem[];
  total: number | null;
  loading: boolean;
  error: string;
  search: string;
  busySlug: string;
  onSearch: (v: string) => void;
  onPick: (it: GalleryItem) => void;
  onClose: () => void;
}> = ({ items, total, loading, error, search, busySlug, onSearch, onPick, onClose }) => (
  <div
    className="nodrag nowheel"
    onClick={onClose}
    onPointerDown={(e) => e.stopPropagation()}
    style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ width: 'min(640px, 92vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
               background: '#16171d', border: '1px solid #2e2e38', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,.6)', color: '#e8e8ea', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #2e2e38' }}>
        <b style={{ fontSize: 14 }}>VibePlugin gallery</b>
        <span style={{ fontSize: 11, opacity: 0.5 }}>{total != null ? `${items.length}/${total}` : ''}</span>
        <input
          className="nodrag"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ marginLeft: 'auto', width: 200, background: '#0e0f14', color: '#e8e8ea', border: '1px solid #33343e', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
        />
        <button className="nodrag" onClick={onClose} style={{ background: '#2a2a30', color: '#e8e8ea', border: '1px solid #3a3a42', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>

      <div className="nowheel" style={{ overflowY: 'auto', padding: 8 }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>Loading gallery…</div>}
        {error && <div style={{ padding: 16, color: '#ff9d9d', fontSize: 12 }}>{error}</div>}
        {!loading && !error && items.length === 0 && <div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>No matches.</div>}
        {items.map((it) => {
          const busy = busySlug === (it.slug || it.id);
          return (
            <button
              key={it.id}
              className="nodrag"
              disabled={!!busySlug}
              onClick={() => onPick(it)}
              style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', alignItems: 'center',
                       background: busy ? '#1f2937' : 'transparent', border: '1px solid transparent', borderRadius: 8, padding: 8, cursor: busySlug ? 'default' : 'pointer', color: '#e8e8ea' }}
              onMouseEnter={(e) => { if (!busySlug) e.currentTarget.style.background = '#1c1d25'; }}
              onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'transparent'; }}
            >
              <img
                src={galleryShotUrl(it.id)}
                alt=""
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                style={{ width: 96, height: 60, objectFit: 'cover', borderRadius: 5, background: '#0e0f14', flex: '0 0 auto' }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ fontSize: 13 }}>{it.name}</b>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: it.isInstrument ? '#3b2f66' : '#22415a', color: it.isInstrument ? '#c9b8ff' : '#a8d4ff' }}>
                    {it.isInstrument ? 'synth' : 'fx'}
                  </span>
                  {busy && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 'auto' }}>loading…</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {it.explanation || ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

export const defaultData = { label: 'AI VST' };

export default React.memo(AiVstFlowNode);
