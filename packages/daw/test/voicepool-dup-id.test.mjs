// Regression test: a duplicate note id (e.g. corrupted/hand-merged project data —
// see the "VibeSynth chord plays forever" bug) must never orphan a still-sounding
// voice. Before the fix, VoicePool.noteOn's steal path could pop a stale queue
// entry (left behind by the duplicate id), find no free voice, and fall back to
// unconditionally grabbing voices[0] WITHOUT calling noteOff on whatever it was
// still playing — that orphaned voice then sustains for the rest of playback.
import { VoicePool } from '../src/audio/VoicePool.ts';

function makeVoice(log, name) {
  return {
    noteOn(p) { log.push(`on ${name} ${JSON.stringify(p)}`); },
    noteOff(p) { log.push(`off ${name} ${JSON.stringify(p ?? {})}`); },
  };
}

const log = [];
const voices = [makeVoice(log, 'v0'), makeVoice(log, 'v1')]; // only 2 voices: easy to exhaust
const pool = new VoicePool(voices);

// id 7 triggered twice back-to-back (as a corrupted/duplicated chord note would be),
// same as InstrumentHost's "trigger immediately following by another trigger" pattern.
pool.noteOn(7, 440);   // -> v0
pool.noteOn(7, 440);   // duplicate id: -> v1 (both voices now busy under queue [7,7])
pool.noteOn(9, 550);   // pool exhausted: must steal, and must NOT silently orphan a voice

const onCount = log.filter((l) => l.startsWith('on ')).length;
const offCount = log.filter((l) => l.startsWith('off ')).length;

console.log(log.join('\n'));
// 3 noteOns happened; a correctly-behaving pool must have released exactly one
// voice (an explicit steal) before the 3rd noteOn, or the new note reused an
// already-off voice — either way, offCount must be >= 1 (never 0, which would
// mean a voice got silently overwritten while still sounding).
const pass = onCount === 3 && offCount >= 1;
console.log(pass ? 'PASS: no voice silently orphaned on a duplicate note id' : 'FAIL: a voice was overwritten without ever receiving noteOff');
process.exit(pass ? 0 : 1);
