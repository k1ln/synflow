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

/** Encode + trigger a browser download of `<song>.mid`. */
export function downloadMidi(project: Project): void {
  const blob = new Blob([encodeMidi(project).buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(project.name || 'song').replace(/[^\w-]+/g, '_')}.mid`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
