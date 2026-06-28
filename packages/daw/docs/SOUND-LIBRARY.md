# Mothscilla — Instruments, Synths & Effects roadmap

A target sound library for a "real" DAW, tailored to Mothscilla (Synflow node graphs +
native Web-Audio FX like the EQ). Each entry lists the **key parameters** so it doubles
as a build spec.

**Legend:** ✅ have · 🟡 partial · ⬜ to build  ·  **Priority:** P0 essential · P1 pro · P2 nice
**WA** = maps to a Web-Audio node (fast native build, like the EQ); **SF** = Synflow flow.

---

## 1. Instruments & Synths

### 1.1 Core synth engines
- ⬜ **P0 — Subtractive / virtual-analog poly synth** (the workhorse). 2–3 oscillators (saw/square/tri/sine/pulse w/ PWM) + sub + noise; unison (voices, detune, spread); multimode filter (LP/HP/BP, 12/24 dB, resonance, key-track, drive); 2× ADSR (amp + filter); 2× LFO (→ pitch/filter/amp/pan, tempo-sync); glide/portamento; mono/legato/poly; voice count. **SF**, partially `makeBasicSynth`/`makeSynthVoice` 🟡
- ⬜ **P0 — Drum synth kit** (808/909-style). Per-voice synthesis: kick (tune, decay, click, drive), snare (tone+noise mix, decay), hats (open/closed, decay, choke group), clap, tom, rim, cowbell. `makeKick` 🟡
- ⬜ **P0 — Sampler** (one-shot + multisample). Start/end, loop (fwd/ping-pong, crossfade), key/velocity zones, root key, ADSR, filter, pitch, reverse, time-stretch/repitch toggle.
- ⬜ **P1 — Drum sampler / pad kit.** 8–16 pads, per-pad: sample, gain, pan, pitch, decay, choke groups, round-robin, velocity layers.
- ⬜ **P1 — FM synth.** 4–6 operators, ratio/level/feedback per op, selectable algorithms, op envelopes; great for bass, bells, e-piano.
- ⬜ **P1 — Wavetable synth.** Scannable wavetables, position LFO/env morph, 2 tables + sub, formant/warp.
- ⬜ **P2 — Granular synth.** Grain size/density/position/spray, pitch, reverse, freeze.
- ⬜ **P2 — Additive synth.** Partial bank, draw/morph spectra.
- ⬜ **P2 — Physical modeling.** Plucked string / mallet / blown (excitation + resonator).
- ⬜ **P2 — Vocoder instrument.** Carrier (internal synth) + modulator (mic/audio), bands, formant shift. (Also usable as an FX.)

### 1.2 "Romplers"/preset instruments (content, built on the sampler/synth)
- ⬜ **P0** Acoustic grand **piano**, **bass** presets (sub, Reese, FM, pluck).
- ⬜ **P1** E-piano (Rhodes/Wurli), **organ** (drawbars + Leslie), **strings**, **brass/stabs**, **pads**, **leads**, **plucks**, **bells/mallets**, **choir**.
- ⬜ **P1** Drum kits: **808**, **909**, **acoustic**, **lo-fi/boom-bap**, **trap**, **house/techno**.

### 1.3 Note/MIDI tools (generators, not sound sources)
- ⬜ **P1 Arpeggiator** (mode up/down/updown/random, rate sync, octaves, gate, swing).
- ⬜ **P1 Step sequencer** (per-step note/velocity/gate/prob), **chord/scale helper**, **randomizer/Euclidean**.

---

## 2. Effects

### 2.1 Dynamics
- ⬜ **P0 Compressor** — threshold, ratio, attack, release, knee, makeup, auto-release, mix (parallel), **sidechain input**, GR meter. **WA** (`DynamicsCompressorNode`) ✅ easy
- ⬜ **P1 Bus / glue compressor** (slow, musical; SSL-style).
- ⬜ **P1 Limiter / brickwall maximizer** — ceiling, gain, lookahead, true-peak (mastering). **WA** (compressor + lookahead) 🟡
- ⬜ **P1 Multiband compressor** — 3–4 bands (split + per-band comp + EQ recombine).
- ⬜ **P0 Gate / expander** — threshold, range, attack/hold/release, sidechain.
- ⬜ **P1 De-esser** (sidechain-EQ’d compressor on highs).
- ⬜ **P2 Transient shaper** (attack/sustain).

### 2.2 EQ & filter
- ✅ **Parametric EQ** (graphical, click-to-add bands, spectrum). **WA**
- ⬜ **P1 Dynamic EQ** (per-band compression).
- ⬜ **P2 Graphic EQ** (fixed bands, fast).
- 🟡 **P0 Filter** — LP/HP ✅; add **BP/notch/shelf**, resonance, drive, envelope/LFO mod. **WA** (`BiquadFilterNode`)
- ⬜ **P1 Auto-wah / envelope filter**, **P2 comb/formant filter**.

### 2.3 Saturation & distortion
- ⬜ **P0 Saturation / drive** — tube/tape/transformer flavors, drive, tone, mix. **WA** (`WaveShaperNode` curves)
- ⬜ **P1 Overdrive / distortion / fuzz** — gain, tone, character. **WA**
- ⬜ **P1 Clipper** (soft/hard), **P0 Bitcrusher / decimator** (bit depth + sample-rate reduce). **WA** (worklet/waveshaper)
- ⬜ **P2 Ring modulator**, **frequency shifter** (core already has a freq-shifter node).

### 2.4 Modulation
- ⬜ **P0 Chorus** (rate, depth, voices, spread, mix). **WA** (delay + LFO)
- ⬜ **P1 Flanger** (feedback, manual, range), **Phaser** (stages, feedback). **WA**
- ⬜ **P1 Tremolo** + **Auto-pan** (rate sync, shape, depth). **WA**
- ⬜ **P2 Vibrato**, **Rotary/Leslie**, **Ensemble**.

### 2.5 Time-based
- ⬜ **P0 Delay** — time (ms + tempo-sync), feedback, **ping-pong**, **multitap**, filter in feedback, ducking, mix. 🟡 (`makeDelayFx` basic) **WA** (`DelayNode`)
- ⬜ **P1 Tape / analog delay** (wow/flutter, saturation, age).
- ⬜ **P0 Reverb** — **convolution** (load IRs: room/hall/plate/spring) **WA** (`ConvolverNode`) + **P1 algorithmic** (size, decay, pre-delay, damping, diffusion, mod, mix).

### 2.6 Pitch & spectral
- ⬜ **P1 Pitch shifter / octaver** (semitones, formant, mix).
- ⬜ **P1 Harmonizer** (intervals, scale-aware).
- ⬜ **P2 Pitch correction / auto-tune** (key/scale, speed).
- ⬜ **P2 Vocoder FX**, **spectral freeze/blur/gate**.

### 2.7 Stereo & utility
- ⬜ **P0 Stereo widener / imager** (M/S width, bass-mono, correlation). 
- ⬜ **P0 Utility** — gain/trim, phase invert, mono-maker, L/R swap, pan. **WA**
- ⬜ **P1 Auto-pan**, **send/return aux buses**, **mid-side splitter**.

### 2.8 Creative / glitch
- ⬜ **P2** Trance/step **gater**, **stutter / buffer-repeat**, **reverse**, **granular FX**, **glitch**, **looper**, **gate sequencer**.

### 2.9 Metering & analysis (tools — read-only, not inserts)
- ⬜ **P0 Spectrum analyzer** (FFT — you already tap `AnalyserNode` for the EQ).
- ⬜ **P1 Loudness meter** (LUFS short/integrated, true-peak), **VU/peak meter**.
- ⬜ **P1 Correlation meter / goniometer**, **P2 oscilloscope**, **tuner**.

---

## 3. Suggested build order (fast wins first)

These map directly to Web-Audio nodes (same pattern as the native EQ), so they’re quick and
sound-accurate:

1. **Compressor** (`DynamicsCompressorNode`) + **Gate**
2. **Reverb** (`ConvolverNode` + a few bundled IRs)
3. **Delay** upgrade (sync, ping-pong, feedback filter) (`DelayNode`)
4. **Saturation / distortion / bitcrusher** (`WaveShaperNode` / worklet)
5. **Chorus / flanger / phaser** (delay + LFO)
6. **Filter** completion (BP/notch/shelf + envelope/LFO) and **Stereo/Utility**
7. **Spectrum analyzer + LUFS meters** (reuse the EQ’s analyser)

Then the bigger engine work: **subtractive poly synth → sampler → drum kit/sampler → FM/wavetable**,
and content packs (piano/keys/bass/pads + 808/909/acoustic kits).
