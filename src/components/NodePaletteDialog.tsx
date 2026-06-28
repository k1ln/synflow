import React, { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

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

const AUDIO_SOURCES = ['OscillatorFlowNode','AudioWorkletOscillatorFlowNode','NoiseFlowNode','SampleFlowNode','MicFlowNode','AudioWorkletFlowNode'];
const AUDIO_DESTINATIONS = ['MasterOutFlowNode','RecordingFlowNode','OscilloscopeFlowNode','AnalyzerNodeGPT'];
const AUDIO_TRANSFORMING = ['GainFlowNode','BiquadFilterFlowNode','IIRFilterFlowNode','DelayFlowNode','ReverbFlowNode','DistortionFlowNode','DynamicCompressorFlowNode','EqualizerFlowNode','VocoderFlowNode','AudioSignalFreqShifterFlowNode','UnisonBeginFlowNode','UnisonEndFlowNode'];
const EVENT_NODES = ['ADSRFlowNode','AutomationFlowNode','ClockFlowNode','MidiKnobFlowNode','FrequencyFlowNode','ConstantFlowNode','EventFlowNode','FlowEventFreqShifterFlowNode'];
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

function NodePill({ nodeKey, onSelect }: { nodeKey: string; onSelect: (k: string) => void }) {
  return (
    <button
      style={pillStyle}
      onClick={() => onSelect(nodeKey)}
      onMouseEnter={e => { e.currentTarget.style.background = '#2a2a35'; e.currentTarget.style.borderColor = '#4a4a58'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#2e2e38'; }}
    >
      {humanize(nodeKey)}
    </button>
  );
}

function SubSection({ title, color, keys, nodeTypes, onSelect, filter }: {
  title: string; color: string; keys: string[];
  nodeTypes: Record<string, React.FC<any>>; onSelect: (k: string) => void;
  filter?: Set<string>;
}) {
  const present = keys.filter(k => k in nodeTypes && (!filter || filter.has(k)));
  if (present.length === 0) return null;
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color, marginBottom: 5, paddingBottom: 3, borderBottom: `1px solid ${color}44` }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {present.map(k => <NodePill key={k} nodeKey={k} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function CategoryBlock({ icon, title, color, keys, nodeTypes, onSelect, filter }: {
  icon: string; title: string; color: string; keys: string[];
  nodeTypes: Record<string, React.FC<any>>; onSelect: (k: string) => void;
  filter?: Set<string>;
}) {
  const present = keys.filter(k => k in nodeTypes && (!filter || filter.has(k)));
  if (present.length === 0) return null;
  return (
    <div style={{ background: '#141417', border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 10px 10px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>{title}
        <span style={{ marginLeft: 'auto', opacity: .4, fontWeight: 400, fontSize: 10 }}>{present.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {present.map(k => <NodePill key={k} nodeKey={k} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────

const NodePaletteDialog: React.FC<NodePaletteDialogProps> = ({ open, onOpenChange, nodeTypes, onSelect }) => {
  const [query, setQuery] = useState('');

  const allKeys = useMemo(() => Object.keys(nodeTypes), [nodeTypes]);

  const handleSelect = useCallback((type: string) => {
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
        }}>
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
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

                {/* ── Audio super-group ── */}
                <div style={{ background:'#16161a', border:'1px solid #4ade8033', borderRadius:10, padding:'10px 12px 12px' }}>
                  <div style={{ fontSize:13, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:'#4ade80', marginBottom:10 }}>~ Modules</div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <SubSection title="↑ Sources"      color="#4ade80" keys={AUDIO_SOURCES}      nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                    <SubSection title="↓ Destinations" color="#f87171" keys={AUDIO_DESTINATIONS} nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                    <SubSection title="↔ FX" color="#60a5fa" keys={AUDIO_TRANSFORMING} nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                  </div>
                </div>

                {/* ── Bottom row: Event / MIDI / Logic ── */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
                  <CategoryBlock icon="⚡" title="Event" color="#facc15" keys={EVENT_NODES} nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                  <CategoryBlock icon="♩"  title="MIDI & Seq"  color="#c084fc" keys={MIDI_SEQ}    nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                  <CategoryBlock icon="><" title="Logic"       color="#94a3b8" keys={LOGIC}        nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                </div>

                {/* ── Other (fallback for future nodes) ── */}
                {uncategorized.length > 0 && (
                  <CategoryBlock icon="·" title="Other" color="#6b7280" keys={uncategorized} nodeTypes={nodeTypes} onSelect={handleSelect} filter={filterSet} />
                )}

              </div>
            )}
          </div>

          <div style={{ marginTop:10, fontSize:10, opacity:.4 }}>Click to add · Esc to close</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default NodePaletteDialog;