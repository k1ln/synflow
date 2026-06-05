import type { Flow } from '../synflow/instruments';
import { makeKick, makeBlip, makeBasicSynth, makeSynthVoice } from '../synflow/instruments';
import { findEntry, cloneFlow } from '../synflow/library';

/** A note in a piano-roll instrument; start/length are in grid steps (fractional). */
export interface PianoNote { id: number; midi: number; start: number; length: number }

/** Where an audio asset's bytes live. Disk = lightweight ref into <folder>/audio/
 *  (streamed, small song JSON); embedded = base64 in the song (portable export). */
export type AudioSource =
  | { kind: 'disk'; fileName: string; mime: string }
  | { kind: 'embedded'; base64: string; mime: string };

/** A decoded audio recording/import, referenced by clips (shared, not duplicated). */
export interface AudioAsset {
  id: string;
  name: string;
  source: AudioSource;
  duration: number;                            // seconds
  peaks?: { min: number[]; max: number[] };    // cached waveform overview
}

/** A clip on an audio track. `start` is the timeline position in (fractional) steps;
 *  `offset`/`duration` are seconds INTO the asset (trim/cut). */
export interface AudioClip {
  id: string;
  assetId: string;
  start: number;       // timeline position, fractional steps
  offset: number;      // trim start within the asset (s)
  duration: number;    // length played from the asset (s)
  gain: number;
}

/**
 * A clip on the song timeline: the track's pattern placed at `start` (in pattern
 * slots) for `length` slots. `loop` makes the pattern repeat from `start` forever
 * (until the next clip / song end) — "send loop to the pattern, it just stays".
 */
export interface Clip { id: string; start: number; length: number; loop: boolean }

/** One band of the native parametric EQ. */
export interface EqBand { id: string; type: BiquadFilterType; freq: number; gain: number; q: number; on: boolean }
/** Native graphical EQ settings (stored on the insert, saved with the song). */
export interface EqSettings { on: boolean; outDb: number; bands: EqBand[] }

/** Built-in (non-Synflow) effect ids. */
export const EQ_FX_ID = 'eq';
/** A fresh, flat EQ — the user clicks the graph to add bands. */
export const defaultEq = (): EqSettings => ({ on: true, outDb: 0, bands: [] });

/** An effect insert (any level). References a library effect; `flow` is an edited
 *  Synflow override, or `eq` holds settings for the built-in graphical EQ. */
export interface FxInsert { id: string; fxId: string; name: string; flow?: Flow; eq?: EqSettings }

/**
 * A pool item: an instrument or drum loaded for the PROJECT (shown on the left).
 * Tracks reference these; the same pool item can be used in several tracks.
 */
export interface PoolItem {
  id: string;
  name: string;
  libId?: string;          // source library flow id (save edits back to disk)
  flow: Flow;
  kind: 'synth' | 'drum';
  gain?: number;           // instrument-level gain (default 1)
  fx?: FxInsert[];         // the instrument's general FX (heard live + in every track)
}

/**
 * An instrument USED inside a track — its own pattern + its own FX chain.
 * (Same pool instrument in two tracks → two independent uses.)
 */
export interface TrackInstrument {
  id: string;
  poolId: string;          // -> PoolItem
  fx: FxInsert[];          // instrument-in-track FX (level 1)
  muted?: boolean;
  steps?: boolean[];       // drums track: this row's step pattern
  notes?: PianoNote[];     // synth track: this instrument's piano roll
  voices?: number;         // synth polyphony
}

/** Automation lane: drives a param over the pattern, at instrument/track/master scope. */
export interface AutomationLane {
  id: string;
  scope: 'instrument' | 'track' | 'master';
  useId?: string;          // instrument-in-track (scope 'instrument')
  fxIndex?: number;        // index into the FX chain at that scope (when automating an FX)
  nodeId: string;
  param: string;
  min: number;
  max: number;
  values: (number | null)[];
}

/** A track: one TYPE (drums, synth, or audio). Drums/synth hold uses of pool
 *  instruments + a track FX chain; audio holds recorded/imported clips on the timeline. */
export interface Track {
  id: string;
  name: string;
  type: 'drums' | 'synth' | 'audio';
  volume: number;
  muted?: boolean;         // arrangement mute: skip this track entirely in the scheduler
  loop: boolean;           // live-performance loop: the track loops continuously
  length: number;          // this track's pattern length, in steps (polymeter)
  uses: TrackInstrument[];
  clips: Clip[];           // song arrangement: where this track's pattern plays (when loop is off, in Song mode)
  audioClips?: AudioClip[];// audio tracks: clips placed on the song timeline
  fx: FxInsert[];          // track-level FX (level 2)
  automation: AutomationLane[];
}

export interface Project {
  name: string;
  bpm: number;
  stepsPerBeat: number;
  totalSteps: number;      // steps per pattern (one slot/bar)
  songSlots: number;       // length of the song timeline, in pattern slots
  pool: PoolItem[];        // left panel: instruments + drums loaded for the project
  tracks: Track[];
  assets: AudioAsset[];    // audio recordings/imports referenced by audio clips
  masterFx: FxInsert[];    // master FX (level 3)
}

// ─── helpers ─────────────────────────────────────────────────────────────────
let _id = 0;
export const uid = (p: string): string => `${p}-${++_id}-${Math.random().toString(36).slice(2, 7)}`;
let _noteId = 1000;
export const newNoteId = (): number => ++_noteId;

const stepArr = (n: number, on: number[] = []): boolean[] => Array.from({ length: n }, (_, i) => on.includes(i));

// Prefer the editable library flow (carries node positions); fall back to the factory.
const libFlow = (id: string, fallback: () => Flow): Flow => {
  const e = findEntry(id);
  return cloneFlow(e ? e.flow : fallback());
};

export function fxInsert(fxId: string): FxInsert {
  if (fxId === EQ_FX_ID) return { id: uid('fx'), fxId, name: 'Equalizer', eq: defaultEq() };
  return { id: uid('fx'), fxId, name: findEntry(fxId)?.name ?? fxId };
}

/** Default project: a Drums track + a Synth track, drawing from a small pool. */
export function defaultProject(): Project {
  const total = 16;
  const pool: PoolItem[] = [
    { id: 'kick', name: 'Kick', libId: 'kick', kind: 'drum', flow: libFlow('kick', makeKick) },
    { id: 'snare', name: 'Snare', libId: 'snare', kind: 'drum', flow: libFlow('snare', () => makeBasicSynth({ frequency: 180, type: 'triangle', decay: 0.12 })) },
    { id: 'hat', name: 'Hat', libId: 'hat', kind: 'drum', flow: libFlow('hat', () => makeBlip(1200)) },
    { id: 'saw', name: 'Saw Lead', libId: 'saw-lead', kind: 'synth', flow: libFlow('saw-lead', () => makeSynthVoice('sawtooth')) },
  ];
  const loopClip = (): Clip => ({ id: uid('clip'), start: 0, length: 1, loop: true });
  return {
    name: 'Untitled Song',
    bpm: 120,
    stepsPerBeat: 4,
    totalSteps: total,
    songSlots: 8,
    pool,
    assets: [],
    masterFx: [],
    tracks: [
      {
        id: 'drums', name: 'Drums', type: 'drums', volume: 0.8, loop: true, length: total, fx: [], automation: [], clips: [loopClip()],
        uses: [
          { id: uid('use'), poolId: 'kick', fx: [], steps: stepArr(total, [0, 4, 8, 12]) },
          { id: uid('use'), poolId: 'snare', fx: [], steps: stepArr(total, [4, 12]) },
          { id: uid('use'), poolId: 'hat', fx: [], steps: stepArr(total, [2, 6, 10, 14]) },
        ],
      },
      {
        id: 'synth', name: 'Synth', type: 'synth', volume: 0.8, loop: true, length: total, fx: [fxInsert('lowpass')], automation: [], clips: [loopClip()],
        uses: [
          {
            id: uid('use'), poolId: 'saw', fx: [], voices: 6,
            notes: [
              { id: 1, midi: 60, start: 0, length: 4 },
              { id: 2, midi: 63, start: 4, length: 4 },
              { id: 3, midi: 67, start: 8, length: 8 },
            ],
          },
        ],
      },
    ],
  };
}

export const blankSteps = (n: number) => stepArr(n);

/** Backfill fields missing from older saved songs (assets registry, audio clips). */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    assets: p.assets ?? [],
    tracks: (p.tracks ?? []).map((t) => (t.type === 'audio' ? { ...t, audioClips: t.audioClips ?? [] } : t)),
  };
}

/** Is a track's pattern playing at song-slot `slot`? A loop clip fills until the
 *  next clip starts (or the song end); a fixed clip covers [start, start+length). */
export function trackActiveAt(clips: Clip[], slot: number, songSlots: number): boolean {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (slot < c.start) continue;
    const end = c.loop ? (sorted[i + 1]?.start ?? songSlots) : c.start + c.length;
    if (slot < end) return true;
  }
  return false;
}

/** Does a track play at song-slot `slot`? A looping track always plays (live);
 *  otherwise its clips decide. */
export function trackPlaysAt(track: Track, slot: number, songSlots: number): boolean {
  return track.loop || trackActiveAt(track.clips, slot, songSlots);
}

/** Seamless loop length for Pattern mode = LCM of all track lengths. */
export function patternLoopLength(tracks: Track[]): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const lcm = (a: number, b: number) => (a && b ? (a / gcd(a, b)) * b : a || b);
  return Math.max(1, tracks.map((t) => Math.max(1, t.length)).reduce(lcm, 1));
}

/** Last step occupied by any audio clip (its absolute end on the song timeline). */
export function audioContentEndSteps(p: Project): number {
  const stepsPerSec = (p.bpm / 60) * p.stepsPerBeat;
  let end = 0;
  for (const t of p.tracks) {
    for (const c of t.audioClips ?? []) end = Math.max(end, c.start + c.duration * stepsPerSec);
  }
  return end;
}

/** Song length in steps. Grows past the user-set `songSlots` to contain every
 *  audio clip (rounded up to whole bars) so long imports play in full and the
 *  timeline/loop spans them — it can grow indefinitely. */
export function songLengthSteps(p: Project): number {
  const base = p.songSlots * p.totalSteps;
  const content = Math.ceil(audioContentEndSteps(p) / p.totalSteps) * p.totalSteps;
  return Math.max(base, content);
}

/** Song length in bars/slots (see {@link songLengthSteps}). */
export function songLengthSlots(p: Project): number {
  return Math.max(1, Math.round(songLengthSteps(p) / p.totalSteps));
}
