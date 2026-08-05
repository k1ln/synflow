// Round-trip test: encodeMidi (export) → parseMidiFile (import) preserves
// tempo and every note's pitch/start/length/velocity within MIDI resolution.
import { encodeMidi, parseMidiFile } from '../src/audio/midiFile';

const project: any = {
  name: 'test', bpm: 128, stepsPerBeat: 4, totalSteps: 16,
  tracks: [{
    id: 't1', name: 'Lead', type: 'synth', volume: 1, loop: false, length: 16, fx: [], automation: [], clips: [],
    uses: [{
      id: 'u1', poolId: 'p', fx: [],
      notes: [
        { id: 1, midi: 60, start: 0, length: 4, velocity: 1 },
        { id: 2, midi: 63, start: 4.5, length: 2, velocity: 0.5 },
        { id: 3, midi: 67, start: 8.25, length: 7.75, velocity: 0.25 },
      ],
    }],
  }],
};

const bytes = encodeMidi(project);
const parsed = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

let pass = true;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`); if (!ok) pass = false; };

check(`bpm ${parsed.bpm}`, parsed.bpm === 128);
check(`1 track (got ${parsed.tracks.length})`, parsed.tracks.length === 1);
const notes = parsed.tracks[0]?.notes.slice().sort((a, b) => a.startBeats - b.startBeats) ?? [];
check(`3 notes (got ${notes.length})`, notes.length === 3);
const want = project.tracks[0].uses[0].notes;
for (let i = 0; i < Math.min(notes.length, want.length); i++) {
  const n = notes[i], w = want[i];
  const startSteps = n.startBeats * project.stepsPerBeat;
  const lenSteps = n.lengthBeats * project.stepsPerBeat;
  check(`note ${i}: midi ${n.midi}`, n.midi === w.midi);
  check(`note ${i}: start ${startSteps.toFixed(3)} ≈ ${w.start}`, Math.abs(startSteps - w.start) < 0.01);
  check(`note ${i}: length ${lenSteps.toFixed(3)} ≈ ${w.length}`, Math.abs(lenSteps - w.length) < 0.01);
  check(`note ${i}: velocity ${n.velocity.toFixed(2)} ≈ ${w.velocity}`, Math.abs(n.velocity - w.velocity) < 0.02);
}
console.log(pass ? '\nPASS: MIDI round-trip verified' : '\nFAIL');
process.exit(pass ? 0 : 1);
