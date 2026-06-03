// Synflow "Host Interface" editor — only shown when the editor is embedded in
// Mothscilla (DAW edit mode). It lets the flow author declare, per node, what the
// host (Mothscilla) may control:
//   - Main In  (audio input)  → data.isInput     [FX]
//   - Main Out (audio output) → data.isOutput    [FX]   (instruments use MasterOut)
//   - Trigger  (note on/off)  → data.isTrigger
//   - Pitch    (note → param) → data.isPitch + data.pitchParam
//   - Knobs    (params)       → data.knobs: [{ param, label, min, max, default }]
// All of it lives in node.data, so it round-trips through the bridge unchanged
// and the DAW reads it directly to build the plugin UI + routing.
import React from 'react';

export interface HostKnob { param: string; label: string; min: number; max: number; default?: number }

const HOST_KEYS = new Set(['isInput', 'isOutput', 'isTrigger', 'isPitch', 'pitchParam', 'triggerHandle', 'knobs', 'label', 'type']);

/** Numeric, automatable params on a node (its knob candidates). */
function numericParams(data: any): string[] {
  if (!data) return [];
  return Object.keys(data).filter((k) => typeof data[k] === 'number' && !HOST_KEYS.has(k));
}

function defaultMax(v: number): number {
  if (v <= 0) return 1;
  if (v >= 1000) return Math.round(v * 2);     // e.g. frequency
  if (v >= 1) return Math.round(v * 4);
  return 1;                                     // 0..1 params (sustain, gain…)
}

const C = { accent: '#6ee7a8', panel: '#0c0f16', border: '#26324a', ink: '#cdd6e6', dim: '#7c8aa3' };

export function HostInterfacePanel({ nodes, setNodes, active }: {
  nodes: any[];
  setNodes: (updater: (nds: any[]) => any[]) => void;
  active: boolean;
}) {
  if (!active) return null;
  const sel = nodes.find((n) => n.selected);

  const wrap: React.CSSProperties = {
    position: 'fixed', top: 64, left: 12, zIndex: 99998, width: 268, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
    background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
    boxShadow: '0 8px 28px rgba(0,0,0,.55)', fontFamily: 'Inter, system-ui, sans-serif', color: C.ink, fontSize: 12,
  };

  if (!sel) {
    return <div style={wrap}><div style={{ fontWeight: 700, color: C.accent, marginBottom: 6 }}>Host Interface</div>
      <div style={{ color: C.dim }}>Select a node to expose its audio ports, trigger, pitch and knobs to Mothscilla.</div></div>;
  }

  const d = sel.data ?? {};
  const update = (patch: Record<string, any>) =>
    setNodes((nds) => nds.map((n) => (n.id === sel.id ? { ...n, data: { ...n.data, ...patch } } : n)));

  const knobs: HostKnob[] = Array.isArray(d.knobs) ? d.knobs : [];
  const isKnob = (p: string) => knobs.some((k) => k.param === p);
  const toggleKnob = (p: string) => {
    update({ knobs: isKnob(p) ? knobs.filter((k) => k.param !== p) : [...knobs, { param: p, label: p, min: 0, max: defaultMax(d[p]), default: d[p] }] });
  };
  const setKnob = (p: string, field: keyof HostKnob, value: any) =>
    update({ knobs: knobs.map((k) => (k.param === p ? { ...k, [field]: value } : k)) });

  const setPitch = (p: string) => update(d.isPitch && d.pitchParam === p ? { isPitch: false, pitchParam: undefined } : { isPitch: true, pitchParam: p });

  const params = numericParams(d);
  const title = d.label || sel.type || sel.id;

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, margin: '5px 0' };
  const chk = (on: boolean) => ({ accentColor: C.accent, width: 14, height: 14 } as React.CSSProperties);
  const numInput: React.CSSProperties = { width: 52, background: '#0a0d14', border: `1px solid ${C.border}`, color: C.ink, borderRadius: 4, padding: '2px 4px', fontSize: 11 };
  const head: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: C.dim, margin: '11px 0 4px' };

  return (
    <div style={wrap}>
      <div style={{ fontWeight: 700, color: C.accent, marginBottom: 2 }}>Host Interface</div>
      <div style={{ color: C.dim, marginBottom: 4, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>

      <div style={head}>Audio</div>
      <label style={row}><input type="checkbox" style={chk(!!d.isInput)} checked={!!d.isInput} onChange={(e) => update({ isInput: e.target.checked })} /> Main In (audio input)</label>
      <label style={row}><input type="checkbox" style={chk(!!d.isOutput)} checked={!!d.isOutput} onChange={(e) => update({ isOutput: e.target.checked })} /> Main Out (audio output)</label>

      <div style={head}>Play</div>
      <label style={row}><input type="checkbox" style={chk(!!d.isTrigger)} checked={!!d.isTrigger} onChange={(e) => update({ isTrigger: e.target.checked })} /> Trigger (note on / off)</label>

      <div style={head}>Parameters → Knobs</div>
      {params.length === 0 && <div style={{ color: C.dim }}>This node has no numeric parameters.</div>}
      {params.map((p) => {
        const on = isKnob(p);
        const k = knobs.find((x) => x.param === p);
        return (
          <div key={p} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 6 }}>
            <label style={row}>
              <input type="checkbox" style={chk(on)} checked={on} onChange={() => toggleKnob(p)} />
              <span style={{ flex: 1 }}>{p}</span>
              <button onClick={() => setPitch(p)} title="Use as pitch (note frequency) target"
                style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${d.isPitch && d.pitchParam === p ? C.accent : C.border}`, background: d.isPitch && d.pitchParam === p ? 'rgba(110,231,168,.16)' : 'transparent', color: d.isPitch && d.pitchParam === p ? C.accent : C.dim }}>pitch</button>
            </label>
            {on && k && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 2px 21px', flexWrap: 'wrap' }}>
                <input value={k.label} onChange={(e) => setKnob(p, 'label', e.target.value)} placeholder="label"
                  style={{ ...numInput, width: 92 }} />
                <span style={{ color: C.dim }}>min</span><input type="number" value={k.min} onChange={(e) => setKnob(p, 'min', parseFloat(e.target.value))} style={numInput} />
                <span style={{ color: C.dim }}>max</span><input type="number" value={k.max} onChange={(e) => setKnob(p, 'max', parseFloat(e.target.value))} style={numInput} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
