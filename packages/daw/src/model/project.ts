import type { Flow } from '../synflow/instruments';
import type { ScaleType } from './pitch';
import { makeKick, makeBlip, makeBasicSynth, makeSynthVoice } from '../synflow/instruments';
import { findEntry, cloneFlow } from '../synflow/library';

/** A note in a piano-roll instrument; start/length are in grid steps (fractional). */
export interface PianoNote { id: number; midi: number; start: number; length: number; velocity?: number /* 0..1, default 1 */ }

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
  fadeIn?: number;     // fade-in length (s) — overlap two clips for a crossfade
  fadeOut?: number;    // fade-out length (s)
  pitch?: number;      // repitch in semitones (varispeed: speed follows pitch; 0/absent = native)
}

/** Playback-rate multiplier for a clip's repitch (2^(semitones/12)). */
export const clipRate = (c: { pitch?: number }): number => (c.pitch ? Math.pow(2, c.pitch / 12) : 1);

/** A decoded video import, referenced by clips on a video track. Container bytes
 *  live on disk or embedded like {@link AudioAsset}. `audioAssetId` links the audio
 *  track extracted from the video (edited/muted independently). Picture compositing
 *  & preview are roadmap items — see docs/VIDEO.md. */
export interface VideoAsset {
  id: string;
  name: string;
  source: AudioSource;                 // container bytes (disk ref or embedded)
  duration: number;                    // seconds
  width: number;
  height: number;
  fps?: number;
  hasAudio: boolean;
  audioAssetId?: string;               // extracted audio (-> AudioAsset)
  poster?: string;                     // first-frame thumbnail (data URL)
}

/** How a video layer combines with the layers below it (maps to a canvas
 *  globalCompositeOperation — see {@link blendCompositeOp}). */
export type VideoBlend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'lighten' | 'darken' | 'add' | 'difference';
export const VIDEO_BLENDS: VideoBlend[] = ['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'add', 'difference'];
export const blendCompositeOp = (b: VideoBlend | undefined): GlobalCompositeOperation =>
  b === 'add' ? 'lighter' : (!b || b === 'normal') ? 'source-over' : (b as GlobalCompositeOperation);

/** Keyframe easing (named cubic-bezier presets; 'hold' = stepped). */
export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'hold';
/** A keyframe: `t` is seconds from the clip's start; `ease` shapes the segment
 *  AFTER it (toward the next keyframe). */
export interface Keyframe { t: number; value: number; ease?: Easing }

/** Per-clip transform. Static values (`x`/`y`/`scale`/`rotation`) are used unless
 *  the matching keyframe list in `kf` is non-empty, in which case the property is
 *  animated. `x`/`y` are fractions of the frame (0 = centered, 0.5 = half a frame).
 *  `scale` multiplies the contain-fit size; `rotation` is degrees. Opacity reuses
 *  {@link VideoClip.opacity} for its static value + `kf.opacity` for animation. */
export interface ClipTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  kf?: { x?: Keyframe[]; y?: Keyframe[]; scale?: Keyframe[]; rotation?: Keyframe[]; opacity?: Keyframe[] };
}

/** Basic per-clip color grade (Lumetri-style). Each value is -1..1 (0 = neutral);
 *  applied as canvas filters + a warm/cool tint overlay. See `colorFilter`. */
export interface ClipColor {
  exposure?: number;     // brightness
  contrast?: number;
  saturation?: number;
  temperature?: number;  // warm (+) / cool (−) white balance
  tint?: number;         // magenta (+) / green (−)
}

/** A clip on a video track. Mirrors {@link AudioClip}: `start` in fractional steps,
 *  `offset`/`duration` in seconds into the asset. `opacity`/`blend` drive multi-
 *  track compositing (upper video tracks over lower); `transform` adds position/
 *  scale/rotation with optional keyframes. */
export interface VideoClip {
  id: string;
  assetId: string;       // -> VideoAsset
  start: number;         // timeline position, fractional steps
  offset: number;        // trim start within the asset (s)
  duration: number;      // length played from the asset (s)
  muted?: boolean;       // mute this clip's extracted audio
  opacity?: number;      // 0..1 (default 1)
  blend?: VideoBlend;    // default 'normal'
  transform?: ClipTransform;
  fadeIn?: number;       // opacity fade-in (s) — cross dissolve = overlap + fade
  fadeOut?: number;      // opacity fade-out (s)
  color?: ClipColor;     // basic color grade
  // ── title clips: a VideoClip with `text` set is a TITLE (drawn as text, no
  //    asset). Reuses position/scale/rotation (transform), fades and compositing. ──
  text?: string;
  titleColor?: string;
  titleAlign?: 'left' | 'center' | 'right';
  titleBold?: boolean;
  titleBg?: boolean;     // lower-third background bar
  titleSize?: number;    // font size as a fraction of frame height (default 0.08)
  titleFont?: string;    // font family (see src/fonts.ts); default Inter
  titleAppear?: TitleAppear; // intro animation
}

/** How a title animates in (over its fade-in duration / ~0.5s). */
export type TitleAppear = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'typewriter' | 'blur';
export const TITLE_APPEARS: TitleAppear[] = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'typewriter', 'blur'];

/**
 * A clip on the song timeline: places one of the track's PATTERNS at `start` (in
 * pattern slots) for `length` slots. `loop` makes the pattern repeat from `start`
 * forever (until the next clip / song end). `patternId` picks which pattern plays
 * (omitted = the track's first pattern, which keeps old songs playing unchanged).
 */
export interface Clip { id: string; start: number; length: number; loop: boolean; patternId?: string }

/**
 * A named snapshot of a track's musical content — per instrument-use step rows
 * (drums) or piano-roll notes (synth) plus its own length (polymeter per pattern).
 *
 * Editing uses a CHECKOUT model: the track's `uses[].steps/notes` always hold the
 * content of the ACTIVE pattern (so every editor keeps working on them unchanged);
 * switching patterns snapshots the current content back into the old pattern and
 * loads the new one. Inactive patterns are read straight from their snapshot (see
 * {@link patternContent}); the active one is read live from the uses.
 */
export interface Pattern {
  id: string;
  name: string;                          // 'A', 'B', … (shown on clips + chips)
  length: number;                        // steps
  steps: Record<string, boolean[]>;      // useId → drum row
  notes: Record<string, PianoNote[]>;    // useId → piano-roll notes
}

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

/** A send from a track to an aux/return bus. `level` is 0..1; `pre` taps
 *  post-FX/pre-fader (level independent of the track fader) instead of post-fader. */
export interface Send { busId: string; level: number; pre?: boolean }

/** Sidechain ducking: this track's level dips when `keyTrackId` plays (kick-ducks-
 *  bass). `amount` 0..1 is the max gain reduction; `release` ms shapes the recovery. */
export interface Sidechain { keyTrackId: string; amount: number; release: number }

/** An aux/return bus: a shared FX destination (e.g. one reverb for many tracks).
 *  Tracks send a portion of their post-fader signal here; the bus sums them, runs
 *  its own FX chain, and returns to the master. Lives in the song JSON. */
export interface Bus { id: string; name: string; volume: number; fx: FxInsert[] }

/** A named cue point on the song timeline (`step` = absolute timeline step).
 *  Click to jump the playhead; use for sections (Intro/Verse/Chorus…). */
export interface Marker { id: string; name: string; step: number }

/** Playback loop region (song mode): when `on`, the transport loops bars
 *  [startBar, endBar) (0-indexed, endBar exclusive). Live-only (not exported). */
export interface LoopRegion { on: boolean; startBar: number; endBar: number }

/** The song's musical key for the piano-roll scale highlight + optional snap.
 *  `root` is a pitch-class (0=C…11=B); `snap` snaps entered notes into the scale. */
export interface MusicalKey { root: number; scale: ScaleType; snap: boolean }

/** A fresh, empty aux bus. */
export function newBus(name = 'Bus'): Bus { return { id: uid('bus'), name, volume: 1, fx: [] }; }

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
  customUi?: string;       // optional custom HTML UI for the Live view (data-attribute bound)
}

/**
 * An instrument USED inside a track — its own pattern + its own FX chain.
 * (Same pool instrument in two tracks → two independent uses.)
 */
export interface TrackInstrument {
  id: string;
  poolId: string;          // -> PoolItem (the source/template this instance came from)
  flow?: Flow;             // this instance's OWN instrument flow — independent param
                           //   state per track (edits here don't touch the pool template
                           //   or other tracks). Absent = fall back to the pool's flow.
  fx: FxInsert[];          // instrument-in-track FX (level 1)
  muted?: boolean;
  steps?: boolean[];       // drums track: this row's step pattern
  notes?: PianoNote[];     // synth track: this instrument's piano roll
  voices?: number;         // synth polyphony
}

/** A timeline automation point: absolute song `step` (fractional ok) + value.
 *  Consecutive points are connected by LINEAR RAMPS (scheduled sample-accurately). */
export interface AutoPoint { step: number; value: number }

/** Automation lane. Two flavours:
 *  - per-step (`values`): sample-and-hold over the PATTERN (legacy, loops with it);
 *  - timeline (`points` non-empty): linear-ramp curve over the SONG arrangement. */
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
  points?: AutoPoint[];    // timeline lane (song-scope curve) when non-empty
  label?: string;          // display name (e.g. "Acid Bass: Cutoff") — cosmetic
}

/** Curve value at absolute song `step` (linear between points; clamped at the ends). */
export function timelineAutoValue(points: AutoPoint[], step: number): number | null {
  if (!points.length) return null;
  const pts = points;                      // kept sorted by step on edit
  if (step <= pts[0].step) return pts[0].value;
  for (let i = 1; i < pts.length; i++) {
    if (step <= pts[i].step) {
      const a = pts[i - 1], b = pts[i];
      const f = b.step === a.step ? 1 : (step - a.step) / (b.step - a.step);
      return a.value + (b.value - a.value) * f;
    }
  }
  return pts[pts.length - 1].value;
}

/** A track: one TYPE (drums, synth, audio, or video). Drums/synth hold uses of pool
 *  instruments + a track FX chain; audio holds recorded/imported clips on the timeline;
 *  video holds video clips (picture handled later — see docs/VIDEO.md). */
export interface Track {
  id: string;
  name: string;
  type: 'drums' | 'synth' | 'audio' | 'video';
  volume: number;
  trim?: number;           // pre-FX input gain (linear, default 1) — gain staging
  phase?: boolean;         // invert polarity (ø)
  pan?: number;            // stereo pan, −1 (left) … +1 (right); default 0 (center)
  muted?: boolean;         // arrangement mute: skip this track entirely in the scheduler
  soloed?: boolean;        // solo: when any track is soloed, only soloed tracks sound
  swing?: number;          // per-track groove override (0..1; absent = the song's global swing)
  loop: boolean;           // live-performance loop: the track loops continuously
  length: number;          // the ACTIVE pattern's length, in steps (polymeter)
  patterns?: Pattern[];    // this track's patterns (see {@link Pattern}; ≥1 after normalize)
  activePatternId?: string;// the pattern currently "checked out" into uses[].steps/notes
  uses: TrackInstrument[];
  clips: Clip[];           // song arrangement: where this track's pattern plays (when loop is off, in Song mode)
  audioClips?: AudioClip[];// audio tracks: clips placed on the song timeline
  videoClips?: VideoClip[];// video tracks: clips placed on the song timeline
  fx: FxInsert[];          // track-level FX (level 2)
  sends?: Send[];          // sends into aux/return buses (post-fader unless send.pre)
  outputBusId?: string;    // route this track's OUTPUT into a group/submix bus (default master)
  sidechain?: Sidechain;   // duck this track from another track's signal
  automation: AutomationLane[];
}

export interface Project {
  name: string;
  bpm: number;
  swing?: number;          // global groove 0..1: delays off-beat 16ths (0 = straight)
  stepsPerBeat: number;
  totalSteps: number;      // steps per pattern (one slot/bar)
  songSlots: number;       // length of the song timeline, in pattern slots
  pool: PoolItem[];        // left panel: instruments + drums loaded for the project
  tracks: Track[];
  buses?: Bus[];           // aux/return buses (shared FX destinations)
  markers?: Marker[];      // named cue points on the song timeline
  loop?: LoopRegion;       // playback loop region (song mode, live-only)
  key?: MusicalKey;        // piano-roll scale highlight + snap (off when unset)
  assets: AudioAsset[];    // audio recordings/imports referenced by audio clips
  videoAssets?: VideoAsset[]; // video imports referenced by video clips
  masterFx: FxInsert[];    // master FX (level 3)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Whether a track should sound: not muted, and (no track soloed, or this one is). */
export function trackAudible(track: Track, tracks: Track[]): boolean {
  if (track.muted) return false;
  const anySolo = tracks.some((t) => t.soloed);
  return !anySolo || !!track.soloed;
}

let _id = 0;
export const uid = (p: string): string => `${p}-${++_id}-${Math.random().toString(36).slice(2, 7)}`;
let _noteId = 1000;
export const newNoteId = (): number => ++_noteId;
/** Seed the counter past every note id already in a loaded project. Without this,
 *  `_noteId` restarts at 1000 on every page load, so a freshly minted id can collide
 *  with one already saved in the file — two notes end up sharing an id, which
 *  corrupts the audio engine's per-note voice bookkeeping (a stuck/orphaned voice). */
function bumpNoteIdPast(p: Project): void {
  let max = _noteId;
  for (const t of p.tracks ?? []) {
    if (t.type === 'audio' || t.type === 'video') continue;
    for (const u of t.uses ?? []) for (const n of u.notes ?? []) if (n.id > max) max = n.id;
    for (const pat of t.patterns ?? []) for (const notes of Object.values(pat.notes ?? {})) for (const n of notes) if (n.id > max) max = n.id;
  }
  _noteId = max;
}

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

/** Default project: a Drums track + a Synth track, drawing from a small pool.
 *  Run through {@link normalizeProject} so tracks get their pattern list. */
export function defaultProject(): Project { return normalizeProject(rawDefaultProject()); }

function rawDefaultProject(): Project {
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
    buses: [{ id: 'reverb-bus', name: 'Reverb', volume: 1, fx: [fxInsert('reverb')] }],
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

/** Swing delay (in fractional steps) for an event firing on step `s`. Off-beat
 *  16ths (odd steps) are pushed later by up to half a step; `swing` 0..1 maps to
 *  straight → heavily dotted (~0.66 ≈ triplet feel). On-beats are unchanged. */
export function swingDelaySteps(s: number, swing = 0): number {
  return swing > 0 && Math.abs(s % 2) === 1 ? swing * 0.5 : 0;
}

/** Snap every note's start to the nearest multiple of `gridSteps` (quantize).
 *  Returns a new array; lengths are preserved. */
export function quantizeNotes(notes: PianoNote[], gridSteps: number): PianoNote[] {
  if (!(gridSteps > 0)) return notes;
  return notes.map((n) => ({ ...n, start: Math.max(0, Math.round(n.start / gridSteps) * gridSteps) }));
}

// ─── patterns ────────────────────────────────────────────────────────────────

const isInstrumentTrack = (t: Track) => t.type === 'drums' || t.type === 'synth';

/** Snapshot the track's live uses content into its active pattern (checkout write-back). */
export function snapshotActivePattern(t: Track): Track {
  if (!isInstrumentTrack(t) || !t.patterns?.length) return t;
  const id = t.activePatternId ?? t.patterns[0].id;
  return {
    ...t,
    patterns: t.patterns.map((p) => p.id !== id ? p : {
      ...p,
      length: Math.max(1, t.length),
      steps: Object.fromEntries(t.uses.filter((u) => u.steps).map((u) => [u.id, u.steps!])),
      notes: Object.fromEntries(t.uses.filter((u) => u.notes).map((u) => [u.id, u.notes!])),
    }),
  };
}

/** Switch the track's active pattern: write the current content back, then load
 *  `patternId` into the uses (+ track length). No-op if it's already active. */
export function checkoutPattern(t: Track, patternId: string): Track {
  if (!isInstrumentTrack(t) || !t.patterns?.length || patternId === t.activePatternId) return t;
  const target = t.patterns.find((p) => p.id === patternId);
  if (!target) return t;
  const saved = snapshotActivePattern(t);
  return {
    ...saved,
    activePatternId: patternId,
    length: Math.max(1, target.length),
    uses: saved.uses.map((u) => ({
      ...u,
      ...(u.steps ? { steps: target.steps[u.id] ?? blankSteps(target.length) } : {}),
      ...(u.notes ? { notes: target.notes[u.id] ?? [] } : {}),
    })),
  };
}

/** The pattern a clip plays (its own, or the track's first for legacy clips). */
export function clipPatternId(t: Track, c: Clip): string | undefined {
  return c.patternId ?? t.patterns?.[0]?.id;
}

/** A pattern's content for one instrument-use. The ACTIVE pattern reads live from
 *  the uses (edits are heard immediately); inactive ones read their snapshot. */
export function patternContent(t: Track, patternId: string | undefined, useId: string): { steps?: boolean[]; notes?: PianoNote[] } {
  const pats = t.patterns ?? [];
  const id = patternId ?? pats[0]?.id;
  const u = t.uses.find((x) => x.id === useId);
  if (!id || !pats.length || id === (t.activePatternId ?? pats[0]?.id)) return { steps: u?.steps, notes: u?.notes };
  const p = pats.find((x) => x.id === id);
  if (!p) return { steps: u?.steps, notes: u?.notes };
  return { steps: p.steps[useId], notes: p.notes[useId] };
}

/** A pattern's length in steps (the active one lives on track.length). */
export function patternLengthOf(t: Track, patternId: string | undefined): number {
  const pats = t.patterns ?? [];
  const id = patternId ?? pats[0]?.id;
  if (!id || !pats.length || id === (t.activePatternId ?? pats[0]?.id)) return Math.max(1, t.length);
  return Math.max(1, pats.find((x) => x.id === id)?.length ?? t.length);
}

/** Next free single-letter pattern name (A, B, … Z, then P27…). */
export function nextPatternName(t: Track): string {
  const used = new Set((t.patterns ?? []).map((p) => p.name));
  for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i); if (!used.has(n)) return n; }
  return `P${(t.patterns?.length ?? 0) + 1}`;
}

/** Write every track's live content back into its active pattern — call before
 *  saving, exporting or bouncing so snapshots reflect the latest edits. */
export function syncPatterns(p: Project): Project {
  return { ...p, tracks: p.tracks.map(snapshotActivePattern) };
}

// ── per-use instrument flow ──────────────────────────────────────────────────
// A track instance carries its OWN instrument flow for independent params; for
// .vstai instruments that flow embeds the compiled wasm (~1 MB) directly in the
// song, so it's fully self-contained. `rehydratePoolFlows` is a load-time safety
// net that restores wasm/GUI onto any use flow that somehow lost it, copying from
// the pool template — harmless when the bytes are already present.
const VSTAI_HEAVY = ['wasmBase64', 'html', 'assembly'] as const;

/** Restore wasm/GUI onto per-use vstai flows from their pool template (after load). */
function rehydratePoolFlows(p: Project): Project {
  return {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      uses: t.uses.map((u) => {
        if (!u.flow) return u;
        const node = u.flow.nodes.find((n: any) => n?.type === 'AiVstFlowNode');
        if (!node || node.data?.wasmBase64) return u;   // not vstai, or already has bytes
        const tmpl = p.pool.find((pi) => pi.id === u.poolId)?.flow?.nodes.find((n: any) => n?.type === 'AiVstFlowNode');
        if (!tmpl?.data?.wasmBase64) return u;
        const merged = { ...node.data }; for (const k of VSTAI_HEAVY) if (tmpl.data[k] != null) merged[k] = tmpl.data[k];
        return { ...u, flow: { ...u.flow, nodes: u.flow.nodes.map((n: any) => (n === node ? { ...n, data: merged } : n)) } };
      }),
    })),
  };
}

/** Backfill fields missing from older saved songs (assets registry, audio/video
 *  clips, and the pattern list — old songs get one pattern built from their uses). */
export function normalizeProject(p: Project): Project {
  p = rehydratePoolFlows(p);   // restore per-use vstai wasm from the pool template
  bumpNoteIdPast(p);
  return {
    ...p,
    assets: p.assets ?? [],
    videoAssets: p.videoAssets ?? [],
    buses: p.buses ?? [],
    markers: p.markers ?? [],
    tracks: (p.tracks ?? []).map((t) => {
      if (t.type === 'audio') return { ...t, audioClips: t.audioClips ?? [] };
      if (t.type === 'video') return { ...t, videoClips: t.videoClips ?? [] };
      if (!t.patterns?.length) {
        const pat: Pattern = {
          id: uid('pat'), name: 'A', length: Math.max(1, t.length),
          steps: Object.fromEntries(t.uses.filter((u) => u.steps).map((u) => [u.id, u.steps!])),
          notes: Object.fromEntries(t.uses.filter((u) => u.notes).map((u) => [u.id, u.notes!])),
        };
        return { ...t, patterns: [pat], activePatternId: pat.id };
      }
      return t;
    }),
  };
}

/** The clip active at song-slot `slot` (whose span contains it), or null. A loop
 *  clip fills until the next clip starts (or the song end); a fixed clip covers
 *  [start, start+length). Used both to gate playback and to anchor the pattern's
 *  phase: the pattern restarts at this clip's `start` (clip-anchored, not song-
 *  anchored), so a multi-bar pattern always plays from its beginning at the clip. */
export function activeClipAt(clips: Clip[], slot: number, songSlots: number): Clip | null {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (slot < c.start) continue;
    const end = c.loop ? (sorted[i + 1]?.start ?? songSlots) : c.start + c.length;
    if (slot < end) return c;
  }
  return null;
}

/** Is a track's pattern playing at song-slot `slot`? (see {@link activeClipAt}). */
export function trackActiveAt(clips: Clip[], slot: number, songSlots: number): boolean {
  return activeClipAt(clips, slot, songSlots) != null;
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

/** Absolute end (in steps) of the last timeline element — any audio, video, or
 *  title clip (titles are video clips with `text` set). This is what the song
 *  length and the playback loop track, so both reach the last element. */
export function contentEndSteps(p: Project): number {
  const stepsPerSec = (p.bpm / 60) * p.stepsPerBeat;
  let end = 0;
  for (const t of p.tracks) {
    for (const c of t.audioClips ?? []) end = Math.max(end, c.start + c.duration * stepsPerSec);
    for (const c of t.videoClips ?? []) end = Math.max(end, c.start + c.duration * stepsPerSec);
  }
  return end;
}

/** Song length in steps = where the last element ends, rounded up to whole bars
 *  (with `songSlots` as the minimum). This is the playback loop length: the
 *  playhead loops back here, just past the last clip / title / video. The
 *  arrangement timeline draws a little further (see {@link TIMELINE_HEADROOM_BARS})
 *  so there's always room to drop the next clip. */
export function songLengthSteps(p: Project): number {
  const base = p.songSlots * p.totalSteps;
  const content = Math.ceil(contentEndSteps(p) / p.totalSteps) * p.totalSteps;
  return Math.max(base, content);
}

/** Empty bars kept past the last element on the arrangement timeline so the song
 *  always "grows a little more" past where the playhead loops. */
export const TIMELINE_HEADROOM_BARS = 2;

/** Song length in bars/slots (see {@link songLengthSteps}). */
export function songLengthSlots(p: Project): number {
  return Math.max(1, Math.round(songLengthSteps(p) / p.totalSteps));
}
