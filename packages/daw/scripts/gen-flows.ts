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

// Lay nodes out left→right (readable in the editor) + expose default host knobs.
function withPositions(flow: Flow): Flow {
  const nodes = flow.nodes.map((n, i) => exposeKnobs({ ...n, position: n.position ?? { x: 80 + i * 240, y: 120 + (i % 2) * 130 } }));
  return { nodes, edges: flow.edges };
}

function writeAll(subdir: string, entries: Entry[]) {
  mkdirSync(join(flowsDir, subdir), { recursive: true });
  for (const e of entries) {
    const flow = withPositions(e.flow);
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
