// One-time generator: turns the code factories into the editable flow-file
// library under packages/daw/flows/. After this, the DAW loads instruments/FX
// from these JSON files (the editable source of truth), not from code.
//   run: npx tsx packages/daw/scripts/gen-flows.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeKick, makeBasicSynth, makeBlip, makeSynthVoice, type Flow } from '../src/synflow/instruments';
import { FX_LIBRARY } from '../src/synflow/effects';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flowsDir = join(root, 'flows');

interface Entry { id: string; name: string; category: string; kind?: 'step' | 'piano'; flow: Flow }

const instruments: Entry[] = [
  { id: 'kick',         name: 'Kick',        category: 'Drums',  kind: 'step',  flow: makeKick() },
  { id: 'snare',        name: 'Snare',       category: 'Drums',  kind: 'step',  flow: makeBasicSynth({ frequency: 180, type: 'triangle', attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 }) },
  { id: 'hat',          name: 'Hi-Hat',      category: 'Drums',  kind: 'step',  flow: makeBlip(900) },
  { id: 'blip',         name: 'Blip',        category: 'Drums',  kind: 'step',  flow: makeBlip(660) },
  { id: 'saw-lead',     name: 'Saw Lead',    category: 'Synths', kind: 'piano', flow: makeSynthVoice('sawtooth') },
  { id: 'square-lead',  name: 'Square Lead', category: 'Synths', kind: 'piano', flow: makeSynthVoice('square') },
];

const effects: Entry[] = FX_LIBRARY.map((f) => ({ id: f.id, name: f.name, category: 'Filter', flow: f.make() }));

// Default knobs exposed to the host (Mothscilla) per node type. The author can
// edit/remove these in Synflow's Host Interface panel.
const KNOB_SPEC: Record<string, Record<string, { label: string; min: number; max: number }>> = {
  ADSRFlowNode: {
    attackTime: { label: 'Attack', min: 0, max: 2 }, decayTime: { label: 'Decay', min: 0, max: 2 },
    sustainLevel: { label: 'Sustain', min: 0, max: 1 }, releaseTime: { label: 'Release', min: 0, max: 2 },
  },
  BiquadFilterFlowNode: { frequency: { label: 'Cutoff', min: 20, max: 18000 }, Q: { label: 'Reso', min: 0.1, max: 24 } },
  DelayFlowNode: { delayTime: { label: 'Time', min: 0, max: 1000 } },
};
const GENERIC_PREFIX = new Set(['adsr', 'filt', 'dly', 'osc', 'gain', 'master', 'in', 'out', 'wet']);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function exposeKnobs(node: any): any {
  const spec = KNOB_SPEC[node.type];
  if (!spec) return node;
  const prefix = String(node.id).split('.')[0];
  const pfx = GENERIC_PREFIX.has(prefix) ? '' : cap(prefix) + ' '; // e.g. amp/pitch ADSR on the kick
  const knobs = Object.keys(spec)
    .filter((k) => typeof node.data?.[k] === 'number')
    .map((k) => ({ param: k, label: pfx + spec[k].label, min: spec[k].min, max: spec[k].max, default: node.data[k] }));
  return knobs.length ? { ...node, data: { ...node.data, knobs } } : node;
}

// Clean left→right signal-flow layout: x = longest path from a source (layer),
// y stacks nodes within a layer. Readable + stable when opened in the editor.
// Columns follow the AUDIO signal path only (main-input / destination-input).
// Modulation edges (envelope → a param like gain/frequency) don't push a node to
// the right, so sources + their envelopes share the left column and the chain
// reads osc → gain → master left→right.
const AUDIO_IN = new Set(['main-input', 'destination-input']);
function layout(flow: Flow): Flow {
  const incoming = new Map<string, string[]>();
  for (const n of flow.nodes) incoming.set(n.id, []);
  for (const e of flow.edges) if (AUDIO_IN.has(e.targetHandle)) incoming.get(e.target)?.push(e.source);
  const cache = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (cache.has(id)) return cache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ins = incoming.get(id) ?? [];
    const d = ins.length ? Math.max(...ins.map((s) => depth(s, seen) + 1)) : 0;
    cache.set(id, d);
    return d;
  };
  const byDepth = new Map<number, any[]>();
  // Audio source(s) first in each column so the signal path stays a straight line.
  for (const n of flow.nodes) { const d = depth(n.id); (byDepth.get(d) ?? byDepth.set(d, []).get(d)!).push(n); }
  const X0 = 100, GX = 340, Y0 = 80, GY = 200;
  const nodes = flow.nodes.map((n) => {
    const d = depth(n.id);
    const row = byDepth.get(d)!.indexOf(n);
    return exposeKnobs({ ...n, position: { x: X0 + d * GX, y: Y0 + row * GY } });
  });
  return { nodes, edges: flow.edges };
}

function writeAll(subdir: string, entries: Entry[]) {
  mkdirSync(join(flowsDir, subdir), { recursive: true });
  for (const e of entries) {
    const flow = layout(e.flow);
    // Top-level nodes/edges + name => directly importable by the synflow editor.
    // `daw` carries DAW-only metadata (ignored by the editor).
    const file = { name: e.name, daw: { id: e.id, category: e.category, kind: e.kind }, nodes: flow.nodes, edges: flow.edges };
    writeFileSync(join(flowsDir, subdir, `${e.id}.json`), JSON.stringify(file, null, 2) + '\n');
  }
}

writeAll('instruments', instruments);
writeAll('effects', effects);

const manifest = {
  instruments: instruments.map(({ id, name, category, kind }) => ({ id, name, category, kind, file: `instruments/${id}.json` })),
  effects: effects.map(({ id, name, category }) => ({ id, name, category, file: `effects/${id}.json` })),
};
writeFileSync(join(flowsDir, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote flow library → ${flowsDir}: ${instruments.length} instruments, ${effects.length} effects`);
