import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

const RECENTS_KEY = 'synflow:nodePaletteRecents';
const RECENTS_MAX = 6;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export interface NodePaletteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nodeTypes: Record<string, React.FC<any>>;
  onSelect: (type: string) => void;
}

function humanize(type: string){
  if (type === 'FlowNode') return 'Flow';
  return type.replace(/FlowNode$/,'').replace(/Node$/,'').replace(/([A-Z])/g,' $1').trim();
}

// ── Category definitions (mirroring the presentation layout) ──────────────

const AUDIO_SOURCES = ['OscillatorFlowNode','AudioWorkletOscillatorFlowNode','KarplusFlowNode','FMFlowNode','WavetableFlowNode','NoiseFlowNode','SampleFlowNode','MicFlowNode','AudioWorkletFlowNode'];
const AUDIO_DESTINATIONS = ['MasterOutFlowNode','RecordingFlowNode','OscilloscopeFlowNode','AnalyzerNodeGPT'];
const AUDIO_TRANSFORMING = ['GainFlowNode','BiquadFilterFlowNode','SvfDriveFilterFlowNode','LadderFilterFlowNode','RingModFlowNode','ChorusFlowNode','GranularFlowNode','IIRFilterFlowNode','DelayFlowNode','ReverbFlowNode','DistortionFlowNode','DynamicCompressorFlowNode','EqualizerFlowNode','VocoderFlowNode','AudioSignalFreqShifterFlowNode','UnisonBeginFlowNode','UnisonEndFlowNode'];
const EVENT_NODES = ['ADSRFlowNode','EnvGenFlowNode','AutomationFlowNode','ClockFlowNode','MidiKnobFlowNode','FrequencyFlowNode','ConstantFlowNode','EventFlowNode','FlowEventFreqShifterFlowNode'];
const MIDI_SEQ = ['MidiFlowNote','MidiButtonFlowNode','MidiFileFlowNode','SequencerFlowNode','SequencerFrequencyFlowNode','ArpeggiatorFlowNode','OrchestratorFlowNode','ScriptSequencerFlowNode'];
const LOGIC = ['FunctionFlowNode','SwitchFlowNode','BlockingSwitchFlowNode','SpeedDividerFlowNode','FlowNode','InputNode','OutputNode','ButtonFlowNode','OnOffButtonFlowNode','MouseTriggerButton','LogFlowNode','WebRTCInputFlowNode','WebRTCOutputFlowNode'];

/** Category accent colors — used both in the palette dialog and on node tops. */
export const NODE_CATEGORY_COLORS: Record<string, string> = {};
const _CATS: [string[], string][] = [
  [AUDIO_SOURCES,      '#4ade80'], // green  — generators
  [AUDIO_DESTINATIONS, '#f87171'], // red    — outputs
  [AUDIO_TRANSFORMING, '#60a5fa'], // blue   — FX
  [EVENT_NODES,        '#facc15'], // yellow — events/envelopes
  [MIDI_SEQ,           '#c084fc'], // purple — MIDI/sequencer
  [LOGIC,              '#94a3b8'], // slate  — logic/utility
];
for (const [keys, color] of _CATS) for (const k of keys) NODE_CATEGORY_COLORS[k] = color;

const ALL_CATEGORIZED = new Set([...AUDIO_SOURCES,...AUDIO_DESTINATIONS,...AUDIO_TRANSFORMING,...EVENT_NODES,...MIDI_SEQ,...LOGIC]);

// ── Shared styles ──────────────────────────────────────────────────────────

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '4px 8px',
  background: 'transparent',
  border: '1px solid #2e2e38',
  borderRadius: 5,
  cursor: 'pointer',
  fontSize: 12,
  color: '#e2e8f0',
  textAlign: 'left',
  width: '100%',
  transition: 'background .12s, border-color .12s',
};

function NodePill({ nodeKey, onSelect, active }: { nodeKey: string; onSelect: (k: string) => void; active?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest' }); }, [active]);
  return (
    <button
      ref={ref}
      style={active ? { ...pillStyle, background: '#2f2f3d', borderColor: '#6366f1' } : pillStyle}
      onClick={() => onSelect(nodeKey)}
      onMouseEnter={e => { e.currentTarget.style.background = '#2a2a35'; e.currentTarget.style.borderColor = '#4a4a58'; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? '#2f2f3d' : 'transparent'; e.currentTarget.style.borderColor = active ? '#6366f1' : '#2e2e38'; }}
    >
      {humanize(nodeKey)}
    </button>
  );
}

const byName = (a: string, b: string) => humanize(a).localeCompare(humanize(b));

function CategoryBlock({ icon, title, color, keys, nodeTypes, onSelect, filter, activeKey, sortAlpha = true }: {
  icon: string; title: string; color: string; keys: string[];
  nodeTypes: Record<string, React.FC<any>>; onSelect: (k: string) => void;
  filter?: Set<string>; activeKey?: string; sortAlpha?: boolean;
}) {
  const present = keys.filter(k => k in nodeTypes && (!filter || filter.has(k)));
  if (present.length === 0) return null;
  // Sort entries A→Z by display name within the group (Recent stays MRU order).
  if (sortAlpha) present.sort(byName);
  // breakInside:'avoid' keeps a category whole within its masonry column so the
  // next category starts directly under the previous one with no row gaps.
  return (
    <div style={{ background: '#141417', border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 10px 10px', marginBottom: 10, breakInside: 'avoid', WebkitColumnBreakInside: 'avoid' } as React.CSSProperties}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>{title}
        <span style={{ marginLeft: 'auto', opacity: .4, fontWeight: 400, fontSize: 10 }}>{present.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {present.map(k => <NodePill key={k} nodeKey={k} onSelect={onSelect} active={k === activeKey} />)}
      </div>
    </div>
  );
}

// Every category rendered as a uniform block, packed into the 4-column masonry.
const CATEGORIES: { icon: string; title: string; color: string; keys: string[] }[] = [
  { icon: '↑',  title: 'Sources',      color: '#4ade80', keys: AUDIO_SOURCES },
  { icon: '↓',  title: 'Destinations', color: '#f87171', keys: AUDIO_DESTINATIONS },
  { icon: '↔',  title: 'FX',           color: '#60a5fa', keys: AUDIO_TRANSFORMING },
  { icon: '⚡', title: 'Event',        color: '#facc15', keys: EVENT_NODES },
  { icon: '♩',  title: 'MIDI & Seq',   color: '#c084fc', keys: MIDI_SEQ },
  { icon: '><', title: 'Logic',        color: '#94a3b8', keys: LOGIC },
];

// ── Dialog ─────────────────────────────────────────────────────────────────

const NodePaletteDialog: React.FC<NodePaletteDialogProps> = ({ open, onOpenChange, nodeTypes, onSelect }) => {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [activeIndex, setActiveIndex] = useState(0);

  const allKeys = useMemo(() => Object.keys(nodeTypes), [nodeTypes]);

  const handleSelect = useCallback((type: string) => {
    setRecents(prev => {
      const next = [type, ...prev.filter(k => k !== type)].slice(0, RECENTS_MAX);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    onSelect(type);
    onOpenChange(false);
  }, [onSelect, onOpenChange]);

  const filterSet = useMemo(() => {
    if (!query.trim()) return undefined;
    const q = query.toLowerCase();
    return new Set(allKeys.filter(k => k.toLowerCase().includes(q) || humanize(k).toLowerCase().includes(q)));
  }, [allKeys, query]);

  const uncategorized = useMemo(() =>
    allKeys.filter(k => !ALL_CATEGORIZED.has(k)).sort((a,b) => humanize(a).localeCompare(humanize(b))),
    [allKeys]
  );

  const noResults = filterSet && filterSet.size === 0;

  // Recents only shown when not searching; filtered to types that still exist.
  const visibleRecents = useMemo(
    () => (query.trim() ? [] : recents.filter(k => k in nodeTypes)),
    [recents, nodeTypes, query]
  );

  // Flat keyboard-navigation order, matching on-screen render order.
  const navKeys = useMemo(() => {
    const inFilter = (k: string) => k in nodeTypes && (!filterSet || filterSet.has(k));
    const out: string[] = [...visibleRecents];
    for (const c of CATEGORIES) out.push(...c.keys.filter(inFilter).sort(byName));
    for (const k of uncategorized) if (inFilter(k)) out.push(k);
    return out;
  }, [nodeTypes, filterSet, visibleRecents, uncategorized]);

  // Reset highlight to the first match whenever the query changes or reopened.
  useEffect(() => { setActiveIndex(0); }, [query, open]);

  const activeKey = navKeys[Math.min(activeIndex, navKeys.length - 1)];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, navKeys.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { if (activeKey) { e.preventDefault(); handleSelect(activeKey); } }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(2px)', zIndex:1000 }} />
        <Dialog.Content style={{
          position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width:'min(1020px, 94vw)', maxHeight:'88vh',
          background:'#111114', color:'#e2e8f0',
          borderRadius:12, border:'1px solid #2a2a35',
          boxShadow:'0 12px 40px rgba(0,0,0,0.7)',
          display:'flex', flexDirection:'column',
          padding:'18px 20px 20px',
          zIndex:1001,
        }}
        onKeyDown={onKeyDown}
        >
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <Dialog.Title style={{ fontSize:16, fontWeight:700, color:'#f1f5f9', letterSpacing:'0.04em' }}>ADD MODULE</Dialog.Title>
            <button onClick={() => onOpenChange(false)} style={{ background:'transparent', color:'#666', border:'none', fontSize:20, cursor:'pointer', lineHeight:1 }} aria-label='Close'>×</button>
          </div>

          {/* Search */}
          <input
            autoFocus
            placeholder='Search modules…'
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ background:'#1a1a20', color:'#e2e8f0', border:'1px solid #333', borderRadius:6, padding:'6px 10px', fontSize:13, marginBottom:14, outline:'none' }}
          />

          {/* Content */}
          <div style={{ overflow:'auto', flex:1 }}>
            {noResults ? (
              <div style={{ padding:16, textAlign:'center', opacity:.5 }}>No matches</div>
            ) : (
              // 4-column masonry: categories flow into columns and pack tightly,
              // each starting directly under the one above with no row-gap blanks.
              <div style={{ columnCount: 4, columnGap: 10 }}>
                {visibleRecents.length > 0 && (
                  <CategoryBlock icon="★" title="Recent" color="#eab308" keys={visibleRecents} sortAlpha={false}
                    nodeTypes={nodeTypes} onSelect={handleSelect}
                    activeKey={activeIndex < visibleRecents.length ? activeKey : undefined} />
                )}
                {CATEGORIES.map(c => (
                  <CategoryBlock key={c.title} icon={c.icon} title={c.title} color={c.color} keys={c.keys}
                    nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet}
                    activeKey={activeIndex < visibleRecents.length ? undefined : activeKey} />
                ))}
                {uncategorized.length > 0 && (
                  <CategoryBlock icon="·" title="Other" color="#6b7280" keys={uncategorized} nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet}
                    activeKey={activeIndex < visibleRecents.length ? undefined : activeKey} />
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop:10, fontSize:10, opacity:.4 }}>↑↓ to navigate · Enter to add · Esc to close</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default NodePaletteDialog;