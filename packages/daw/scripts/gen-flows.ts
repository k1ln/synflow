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

// Lay nodes out left→right so the graph is readable when opened in the editor.
function withPositions(flow: Flow): Flow {
  const nodes = flow.nodes.map((n, i) => ({ ...n, position: n.position ?? { x: 80 + i * 240, y: 120 + (i % 2) * 130 } }));
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
