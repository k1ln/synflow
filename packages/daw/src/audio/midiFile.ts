// Standard MIDI File (SMF, format 1) export of the project's synth tracks: a tempo
// track + one note track per synth track. Notes come from each track's piano-roll
// uses; timing converts steps → ticks at PPQ resolution.
import type { Project } from '../model/project';

const PPQ = 480;

/** MIDI variable-length quantity. */
function vlq(n: number): number[] {
  const out = [n & 0x7f];
  for (n >>= 7; n > 0; n >>= 7) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function be32(n: number): number[] { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function chunk(tag: string, body: number[]): number[] {
  return [...[...tag].map((c) => c.charCodeAt(0)), ...be32(body.length), ...body];
}

/** Encode the project's synth tracks to an SMF byte array. */
export function encodeMidi(project: Project): Uint8Array {
  const synth = project.tracks.filter((t) => t.type === 'synth');
  const ntracks = 1 + synth.length;
  const ticksPerStep = PPQ / project.stepsPerBeat;
  const out: number[] = [...chunk('MThd', [0, 1, (ntracks >> 8) & 0xff, ntracks & 0xff, (PPQ >> 8) & 0xff, PPQ & 0xff])];

  // tempo track
  const uspq = Math.round(60000000 / project.bpm);
  out.push(...chunk('MTrk', [...vlq(0), 0xff, 0x51, 0x03, (uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff, ...vlq(0), 0xff, 0x2f, 0x00]));

  synth.forEach((track, ti) => {
    const ch = ti % 16;
    const evs: { tick: number; data: number[] }[] = [];
    for (const use of track.uses) {
      if (use.muted) continue;
      for (const n of use.notes ?? []) {
        const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 1) * 127)));
        evs.push({ tick: Math.round(n.start * ticksPerStep), data: [0x90 | ch, n.midi & 0x7f, vel] });
        evs.push({ tick: Math.round((n.start + n.length) * ticksPerStep), data: [0x80 | ch, n.midi & 0x7f, 0] });
      }
    }
    evs.sort((a, b) => a.tick - b.tick || (a.data[0] & 0xf0) - (b.data[0] & 0xf0)); // note-offs (0x80) before note-ons (0x90) at a tie
    const name = track.name.slice(0, 127);
    const body: number[] = [...vlq(0), 0xff, 0x03, name.length, ...[...name].map((c) => c.charCodeAt(0) & 0x7f)];
    let last = 0;
    for (const e of evs) { body.push(...vlq(e.tick - last), ...e.data); last = e.tick; }
    body.push(...vlq(0), 0xff, 0x2f, 0x00);
    out.push(...chunk('MTrk', body));
  });

  const bytes = new Uint8Array(new ArrayBuffer(out.length)); // explicit ArrayBuffer → valid BlobPart
  bytes.set(out);
  return bytes;
}

// ─── import ──────────────────────────────────────────────────────────────────

export interface MidiImportNote { midi: number; startBeats: number; lengthBeats: number; velocity: number }
export interface MidiImportTrack { name?: string; notes: MidiImportNote[] }
export interface MidiImport { bpm?: number; tracks: MidiImportTrack[] }

/** Parse a Standard MIDI File (format 0/1). Returns note times in BEATS (quarter
 *  notes) so the caller can map them onto the project's step grid at any meter.
 *  Running status, all channels; tempo = the file's first set-tempo event. */
export function parseMidiFile(bytes: ArrayBuffer): MidiImport {
  const d = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  let pos = 0;
  const str4 = () => { const s = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]); pos += 4; return s; };
  if (str4() !== 'MThd') throw new Error('not a MIDI file');
  const hlen = d.getUint32(pos); pos += 4;
  const division = d.getUint16(pos + 4);
  const ntracks = d.getUint16(pos + 2);
  pos += hlen;
  if (division & 0x8000) throw new Error('SMPTE time division not supported');
  const ppq = division || 480;

  let bpm: number | undefined;
  const tracks: MidiImportTrack[] = [];
  for (let t = 0; t < ntracks && pos + 8 <= u8.length; t++) {
    if (str4() !== 'MTrk') break;
    const len = d.getUint32(pos); pos += 4;
    const end = pos + len;
    let tick = 0, status = 0;
    let name: string | undefined;
    const notes: MidiImportNote[] = [];
    const open = new Map<number, { tick: number; vel: number }>(); // key(ch<<8|midi) → on
    const vlqRead = () => { let v = 0, b; do { b = u8[pos++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    const closeNote = (key: number, offTick: number) => {
      const on = open.get(key); if (!on) return;
      open.delete(key);
      notes.push({ midi: key & 0x7f, startBeats: on.tick / ppq, lengthBeats: Math.max(1 / 32, (offTick - on.tick) / ppq), velocity: on.vel / 127 });
    };
    while (pos < end) {
      tick += vlqRead();
      let b = u8[pos];
      if (b & 0x80) { status = b; pos++; } else { b = status; }  // running status
      const type = b & 0xf0, ch = b & 0x0f;
      if (b === 0xff) {                                          // meta
        const meta = u8[pos++]; const mlen = vlqRead();
        if (meta === 0x51 && mlen === 3) { const uspq = (u8[pos] << 16) | (u8[pos + 1] << 8) | u8[pos + 2]; if (!bpm) bpm = Math.round(60000000 / uspq); }
        if (meta === 0x03 && !name) name = new TextDecoder().decode(u8.slice(pos, pos + mlen));
        pos += mlen;
      } else if (b === 0xf0 || b === 0xf7) { pos += vlqRead(); } // sysex
      else if (type === 0x90 || type === 0x80) {
        const midi = u8[pos++], vel = u8[pos++];
        const key = (ch << 8) | midi;
        if (type === 0x90 && vel > 0) { closeNote(key, tick); open.set(key, { tick, vel }); }
        else closeNote(key, tick);
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) pos += 2;
      else if (type === 0xc0 || type === 0xd0) pos += 1;
      else pos++; // unknown — skip a byte defensively
    }
    for (const key of [...open.keys()]) closeNote(key, tick);    // hanging notes end at track end
    pos = end;
    if (notes.length || name) tracks.push({ name, notes });
  }
  return { bpm, tracks: tracks.filter((t) => t.notes.length) };
}

/** Encode + trigger a browser download of `<song>.mid`. */
export function downloadMidi(project: Project): void {
  const blob = new Blob([encodeMidi(project).buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(project.name || 'song').replace(/[^\w-]+/g, '_')}.mid`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
