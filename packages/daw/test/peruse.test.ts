// Per-use instrument independence must survive a save→load round-trip: each track
// instance keeps its OWN param values, and its .vstai wasm travels embedded in the
// song (self-contained). A plain JSON round-trip mirrors how songs are saved/loaded.
import { normalizeProject } from '../src/model/project';

const vstaiNode = (cutoff: number) => ({
  id: 'vstai', type: 'AiVstFlowNode',
  data: { vstaiName: 'Acid', isInstrument: true, param2: cutoff, wasmBase64: 'AAAA'.repeat(2000), html: '<head></head><body>gui</body>', knobs: [{ param: 'param2', label: 'Cutoff', min: 0, max: 1 }] },
});

const project: any = {
  name: 't', bpm: 120, stepsPerBeat: 4, totalSteps: 16, songSlots: 4, assets: [], masterFx: [],
  pool: [{ id: 'p1', name: 'Acid', libId: 'vstai:acid-bass', kind: 'synth', flow: { nodes: [vstaiNode(0.5)], edges: [] } }],
  tracks: [{
    id: 'tk', name: 'Bass', type: 'synth', volume: 0.8, loop: false, length: 16, fx: [], automation: [], clips: [],
    uses: [
      { id: 'u1', poolId: 'p1', flow: { nodes: [vstaiNode(0.2)], edges: [] }, fx: [], notes: [] },   // instance A: cutoff 0.2
      { id: 'u2', poolId: 'p1', flow: { nodes: [vstaiNode(0.9)], edges: [] }, fx: [], notes: [] },   // instance B: cutoff 0.9
    ],
  }],
};

let pass = true;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`); if (!ok) pass = false; };

// save → load (how the DAW persists a song)
const loaded = normalizeProject(JSON.parse(JSON.stringify(project)));
const lu1 = loaded.tracks[0].uses[0].flow.nodes[0].data;
const lu2 = loaded.tracks[0].uses[1].flow.nodes[0].data;

check('use A keeps its own param (0.2)', lu1.param2 === 0.2);
check('use B keeps its own param (0.9)', lu2.param2 === 0.9);
check('instances stay different (0.2 ≠ 0.9)', lu1.param2 !== lu2.param2);
check('use A wasm embedded in song', typeof lu1.wasmBase64 === 'string' && lu1.wasmBase64.length > 100);
check('use B wasm embedded in song', typeof lu2.wasmBase64 === 'string' && lu2.wasmBase64.length > 100);
check('editing one instance would not touch the other (separate flow objects)', loaded.tracks[0].uses[0].flow !== loaded.tracks[0].uses[1].flow);

console.log(pass ? '\nPASS: per-use instrument independence survives save/load' : '\nFAIL');
process.exit(pass ? 0 : 1);
