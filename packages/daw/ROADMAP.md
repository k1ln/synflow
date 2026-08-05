# DAW Roadmap — path to a professional-grade DAW

> **Status (2026-07-07)** — implemented in this pass:
> - **Phase 1 ✅** sample-accurate timing: `when`-scheduled triggers end-to-end (scheduler → VoicePool → InstrumentHost → engine ADSR/param handlers), offline-bounce exactness (floor-grouped delivery + EventBus drain), plus fixes found on the way: web ADSR `decayTime` bug, offline master-out `instanceof` bug (synths were silent in bounces), bounce dropping note velocity. Regression test: `npm test` (`test/timing.test.mjs`, 0-sample onset error).
> - **Phase 2 ✅** per-clip patterns: `Pattern` entity + checkout model (`uses[].steps/notes` = active pattern's edit view), clip `patternId` + letter badge (click to cycle), pattern chips in the track editor, migration via `normalizeProject`, pattern-aware scheduler/bounces/PatternMini.
> - **Phase 3 ✅** autosave + crash-recovery restore prompt; arrangement clip selection + Delete/⌘C/⌘X/⌘V/⌘D; Space/Home transport keys; OS drag-and-drop (audio/video/MIDI); MIDI file import (SMF parser + round-trip test `test/midi.test.ts`); MIDI learn for track volume/pan (TopBar `learn`); time-signature automation/pattern desync fixed.
> - **Phase 4 ✅** timeline curve automation: `points` lanes with exact linear-ramp scheduling (live + both bounces), curve rows on the arrangement (click/drag/dbl-click editor), "+ Song curve" in the track editor.
> - **Phase 5** export quality ✅ (16-bit TPDF-dithered / 24-bit / 32-float WAV, sample-rate choice in Export dialog, 32-float intermediate for ranged export, 4×-oversampled true-peak meter); group buses + pre-fader sends ✅ (`Track.outputBusId` routing, per-send pre/post toggle); recording count-in ✅. **PDC deferred**: every FX insert in the library is zero-latency IIR — there is no latency source to compensate yet; add insert latency reporting when the first look-ahead/linear-phase FX lands, then sum per chain + align parallel paths with DelayNodes.
> - **Phase 6 partial**: triplet + dotted piano-roll grids ✅; velocity lane (draw-editing, selection-aware) ✅; audio-clip repitch ✅ (semitone varispeed via playbackRate — full tempo-independent stretch still open); per-track swing override ✅. Time-stretch engine, groove templates, external sync: open.
> - **Phase 7 partial**: `pointercancel` on all window-listener drags ✅; AudioTrackLane fixes (atomic left-trim, zero-duration fade NaN guard) ✅; takes now land where recording began (was: where it stopped) ✅. `app.tsx` split, full editor unification, playhead render isolation: open.

Ordered by leverage: engine credibility first, structural model second, daily-workflow
polish third, mix-engineer trust fourth, then reach features. Each phase is shippable
on its own. File references point at the code as of 2026-07.

---

## Phase 1 — Sample-accurate timing (engine credibility)

**Problem.** Audio clips are sample-accurate (worklet gated on `currentTime * sampleRate`,
`audio/ClipStreamer.ts:62`), but synth/drum notes and automation fire via
`window.setTimeout(fn, lead + sub)` on the main thread (`app.tsx:390,402-408`). Under
load (React renders, GC, meter rAF loops) notes land late and uneven, and drift against
the sample-accurate clips and metronome. The scheduler already computes a precise
audio-clock `time` per step (`audio/Scheduler.ts`) — it is currently discarded for notes.

**Design: keep the main-thread lookahead, execute on the audio clock.**
The classic two-clock pattern: the main thread only needs to *deliver* events ahead of
time (jitter-tolerant, we already have a 120 ms lookahead); the *execution* moment must
be read from the audio clock, never from a timer.

1. **Thread `when` through the trigger contract.**
   - `Scheduler` callback already gets `time` (AudioContext seconds). Pass it down:
     `VoicePool.noteOn(id, freq, vel, when)` / `noteOff(id, when)`,
     `InstrumentHost.trigger(payload, when)` / `release(payload, when)`,
     `Mixer.applyAutomation(trackId, lane, v, when)`.
   - Compute `when = time + sub/1000 + swing/1000` once, instead of converting to a
     setTimeout delay. Delete the `setTimeout` wrappers in `app.tsx:388-408`.

2. **Engine: add `when` to `receiveNodeOn/Off`** (`packages/core/src/AudioGraphManager.ts:920`).
   Carry it in the event payload (`{ when, ...payload }`). Then per node class:
   - **Worklet-backed nodes (16 of 66)**: post `{ type:'noteOn', frame: Math.round(when * sampleRate), payload }`
     to the processor. In `process()`, hold a small ring buffer of pending events sorted
     by frame; apply each at its exact sample offset within the current 128-frame block
     (split the block at the event frame — same technique ClipStreamer already uses to
     start on an exact sample). postMessage latency doesn't matter: the event arrives
     ~120 ms early and waits in the queue.
   - **Native-node paths (oscillators, gains, envelopes)**: replace `.value =` writes
     with `setValueAtTime/linearRampToValueAtTime(when …)` and `osc.start(when)`. Only
     3 node classes use AudioParam scheduling today — this is the bulk of the mechanical
     work. The velocity VCA in `InstrumentHost` (`vca.gain.value =`, `InstrumentHost.ts:64`)
     must become `vca.gain.setValueAtTime(v, when)` or per-voice gains — a shared
     `.value` write is both unscheduled *and* wrong for overlapping notes.
   - **Fallback**: nodes not yet migrated get a shim that fires at `when` via a timer —
     no worse than today, and the graph migrates class by class.

3. **Automation on the audio clock.** `applyAutomation` targets AudioParams — use
   `setTargetAtTime(v, when, τ)` (short τ ≈ 5–15 ms) instead of instantaneous sets: this
   both schedules exactly and kills zipper noise. (Full curve automation is Phase 4;
   this step just de-jitters what exists.)

4. **Playhead/UI**: `setCurrentStep` stays timer-driven (it's cosmetic), but derive the
   drawn playhead from `ctx.currentTime` against the transport origin, not from step
   ticks, so the UI can't lie about where audio is.

5. **Offline bounce wins for free.** Once triggers accept `when`, the
   `ctx.suspend()/resume()` 128-frame stepping hack (`audio/bounce.ts:113-130`,
   `bounceStream.ts:174`) can schedule everything up front — removing the ±1.5 ms
   quantization and the "first block lands at frame 128" artifact, and making bounce
   bit-faithful to live playback.

**Verify:** render a metronome + drum hit programmed on the same step; assert onset
delta < 1 sample in the bounced WAV. Live: loopback-record while artificially loading
the main thread (synthetic 50 ms jank loop); onsets must stay within one block (2.9 ms)
and show zero drift over 5 minutes. Add this as a render test.

---

## Phase 2 — Per-clip MIDI content (structural ceiling)

An arrangement clip currently places *the track's single pattern* (`Clip` =
`{start,length,loop}`, `model/project.ts:133`; notes live on the track's
`TrackInstrument.notes/steps`). One melody per track, forever. Every mainstream DAW
makes the clip own its content. Do this before more features pile onto the current model.

- Introduce `Pattern` as a first-class entity (notes/steps per instrument-use, its own
  length) and make `Clip` reference `patternId`. A track holds a pattern list; the
  arrangement places any of them. `normalizeProject` migrates old songs (each track's
  current notes/steps become "Pattern 1" referenced by all existing clips).
- Piano roll / step grid edit the *pattern under the selected clip*, not "the track".
- Unlocks with the same change: clip duplicate-as-unique vs shared (Ableton-style),
  per-clip transpose, arrangement copy/paste of musical content, groove per clip later.
- Scheduler change is small: `activeClipAt` already anchors pattern phase per clip
  (`model/project.ts:370`); it just reads notes from the clip's pattern instead of the track.

---

## Phase 3 — Daily-workflow table stakes (cheap, huge payoff)

- **Autosave + crash recovery.** Timed autosave (30–60 s, debounced after changes) to the
  granted folder (`flowStore.saveProject`), `beforeunload`/`visibilitychange` flush, and
  a "restore unsaved session?" prompt on boot. Keep N rolling autosave files → doubles as
  project versioning.
- **Arrangement clipboard + shortcuts.** ⌘C/⌘X/⌘V/⌘D and Delete for clips in
  `Arrange.tsx` (the clipboard currently exists only inside the piano roll); Space =
  play/stop, Home/Return = to start, ⌘←/→ nudge, 1/2/3 tool switch, L = loop toggle.
  One keymap module, not scattered listeners.
- **OS drag-and-drop** of audio/video/MIDI onto the arrangement and pool (`onDrop` +
  `dataTransfer`; currently file-picker only).
- **MIDI file import** (export exists, `audio/midiFile.ts`; import lands naturally on
  Phase 2's patterns).
- **MIDI learn.** Map CC → any knob/fader/transport action; store mappings per project +
  a global default map. `useMidiInput.ts` already normalizes messages — add a capture
  mode ("move a control") and a routing table.
- **Fix the automation/time-signature desync bug**: `setTimeSig` resizes `uses.steps`
  but not `AutomationLane.values` (`app.tsx:552-563`) — lanes silently shift after a
  meter change. (Real fix subsumed by Phase 4, but patch it now.)

---

## Phase 4 — Timeline automation done right

Replace per-pattern step arrays (`AutomationLane.values`, sample-and-hold, zipper-prone,
pattern-length-coupled) with **curve automation on the song timeline**:

- Model: `{ points: [{step, value, curve}] }` per lane; lanes attach to track volume/pan,
  any FX param, sends, and master — over the *arrangement*, not the pattern.
- Playback: convert segments to `setValueAtTime` + `linearRampToValueAtTime` /
  `setTargetAtTime` scheduled ahead by the Phase-1 machinery — sample-accurate ramps,
  no per-step timers at all.
- UI: draw/edit in an arrangement automation lane (reuse `AutomationLaneRow` rendering);
  keep the step-lane UI as a quick "draw stepped" input mode that emits points.
- Include tempo? Defer tempo *automation* (it interacts with audio-clip anchoring) but
  design the point model so a tempo lane can slot in later.

---

## Phase 5 — Mix-engineer trust (the "finish a record here" tier)

- **Plugin delay compensation.** Every FX insert reports latency; `Mixer` sums chain
  latency per path and inserts matching DelayNodes on parallel paths (dry paths, sends,
  sidechain key). Without it, any look-ahead limiter or linear-phase EQ phase-smears
  the mix. Start simple: static per-chain compensation at graph build.
- **Export quality**: 24-bit and 32-float WAV (16-bit path gets TPDF dither —
  `audio/wav.ts:8` currently hard-rounds), selectable sample rate, and true-peak
  (4× oversampled) readout in `LoudnessMeter` (it self-documents sample-peak only).
- **Group/submix buses**: allow routing a track's *output* into a bus (buses today are
  aux-return only, `Mixer.ts:166`; all tracks hard-wire to `masterSum`, `Mixer.ts:157`).
  One `outputBusId?` on Track + recursion guard. Add pre/post toggle on sends.
- **Recording upgrades**: count-in bars, punch-in/out region, loop-record with take
  lanes → comping (pairs naturally with Phase 2's clip model), low-latency monitoring
  via `getUserMedia({latency:0})` → direct WorkletNode path instead of the `<audio>`
  element (`AudioClipPlayer.ts:72`).
- **Proper mono handling**: track channel-count metadata instead of forcing stereo
  duplication (`ClipStreamer.ts:121`, `bounceStream.ts:54`).

---

## Phase 6 — Audio intelligence (reach features)

- **Time-stretch/warp**: start with playback-rate repitch (cheap), then integrate a
  stretch engine (e.g. SoundTouch/RubberBand via WASM — fits the existing wasmtime/WASM
  infrastructure) for tempo-following clips; warp markers later.
- **Clip pitch/transpose** for audio; **tempo detection** on import.
- **Groove templates**: extract/apply per-clip groove (swing today is one global scalar).
- **External sync**: Ableton Link (there are WASM ports) and/or MIDI clock out.
- **Piano-roll depth**: velocity lane with ramp drawing, triplet/dotted grids, CC lanes,
  strum/arp/legato tools (chord stamp + scale lock + humanize already exist and are good).

---

## Phase 7 — Platform & code health (parallel track, do continuously)

- **Break up `app.tsx` (~2000 lines).** Move project state into a reducer/store; make the
  audio graph a *reconciler* that diffs project state (the state+shadow-refs+manual
  `buildAudio()` triple is the #1 source of future UI/audio drift; undo currently
  rebuilds the whole graph — audibly glitchy).
- **Unify the two audio-clip editors** (`Arrange.tsx` inline lane vs `AudioTrackLane.tsx`)
  — duplicated trim/fade/split logic already diverges (NaN guard, atomic left-trim).
- **Isolate the playhead** from the React tree (`setCurrentStep` re-renders everything
  ~10×/s; drags clone the whole project per pointermove). `React.memo` boundaries +
  a transform-only playhead layer.
- **Pointer robustness**: `setPointerCapture` + `pointercancel` on all drags (lost
  pointerup currently leaks window listeners); touch/pen support falls out of this.
- **Accessibility & i18n**: ARIA roles + keyboard operation for knobs/faders/keys;
  extract strings.
- **Perf hygiene**: stop re-sorting clips per render/call (`Arrange.tsx:362`,
  `activeClipAt`), fix O(n²) voice-steal scan (`VoicePool.ts:24`).

---

## Sequencing rationale

1→2 are ordered by *cost of delay*: timing is the engine's credibility and touches the
trigger contract everything else builds on; the clip/pattern model gets more expensive
to change with every feature added on top. 3 is cheap wins that make the DAW livable
daily. 4 depends on 1 (scheduled params). 5 makes exports trustworthy. 6 is
differentiation. 7 runs alongside everything — each phase that touches `app.tsx`
should leave it smaller than it found it.
