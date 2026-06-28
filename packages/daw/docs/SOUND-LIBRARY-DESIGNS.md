# Building the library in the Synflow synth-builder — design notes

How I'd patch each instrument/effect from [SOUND-LIBRARY.md](SOUND-LIBRARY.md) using
Synflow's node graph (the "web audio synth builder"). Grounded in the real node set and the
flow format (`nodes` + `edges`, `data.knobs` expose UI knobs).

## 0. Primitives & conventions

**Building-block nodes** (from `@synflow/core`): `Oscillator`, `Noise`, `ADSR`, `Gain`,
`BiquadFilter`, `IIRFilter`, `Delay`, `Distortion` (waveshaper), `DynamicCompressor`, `Reverb`,
`Equalizer`, `FrequencyShifter` / `AudioSignalFreqShifter` (ring-mod/shift), `Vocoder`,
`Constant` (bias/offset), `Function` (math/transfer curve), `Unison{Begin,End}`, `Sample` /
`AudioBufferSource`, `Sequencer`/`Arpeggiator`, `Analyzer`/`Oscilloscope`, `MasterOut`,
`Input`/`Output`.

**Signal vs. control.** An edge connects `sourceHandle:output → targetHandle:<handle>`. A node
exposes `main-input` (audio in) **and per-parameter handles** (`gain`, `frequency`, `Q`, …).
Routing a source into a *param handle* = modulation (Web-Audio a-rate AudioParam summing).

**Markers in `data`:**
- `isPitch:true, pitchParam:'frequency'` → osc/sample whose pitch follows the played note.
- `isTrigger:true` → envelope/seq fired by note-on/off.
- `isInput:true` / `isOutput:true` → the in/out of an **effect** flow (FxChain wires these).
- `knobs:[{param,label,min,max,default}]` → which params surface as device knobs.

**The five idioms** (everything is combinations of these):
```
VCO   Osc(type, isPitch) ───────────────▶ (signal)
VCA   src → Gain.main-input ;  ADSR ─▶ Gain.gain
VCF   src → BiquadFilter ;  ENV/LFO·depth ─▶ Filter.frequency
ENV   ADSR(isTrigger) ─▶ <param>            (a/d/s/r knobs)
LFO   Osc(0.05–20 Hz) → Gain[depth] ─▶ <param>   (rate, depth, sync)
```
**Poly/voice model:** a synth flow is one *voice*; the host's `VoicePool` clones it N times and
the played note drives the `isPitch` osc + fires `isTrigger` envelopes. So design **one voice**.

---

## 1. Instruments & synths

### 1.1 Subtractive / virtual-analog poly synth (P0, the workhorse)
```
Osc A (saw, isPitch) ┐
Osc B (square,isPitch,detune) ├─ mix(Gain each) → Filter(Biquad LP/HP/BP) → VCA(Gain) → Master
Sub  (sine -1oct)    │                              ▲                         ▲
Noise                ┘                       FiltEnv ADSR·EnvDepth        AmpEnv ADSR
LFO1 Osc → Gain[d] ─▶ {Osc.detune | Filter.freq | VCA.gain(tremolo)}
LFO2 …               ─▶ {PWM | pan}
```
- **Osc A/B/Sub/Noise** each → its own `Gain` (level), summed into the filter. B uses `detune`
  + a `Constant`→`Osc.detune` for fine tune; PWM = LFO→pulse-width param (needs a pulse osc;
  approximate with two detuned saws if no PWM param).
- **Unison**: wrap the osc section in `UnisonBegin … UnisonEnd` (voices, detune, spread).
- **Filter env**: `ADSR(isTrigger)` → `Gain[EnvAmount]` → `BiquadFilter.frequency`; key-track =
  `Constant(noteHz)·amount` → same handle.
- **Knobs:** osc mix, detune, sub level, noise; cutoff, reso, drive, filter ADSR, env amount;
  amp ADSR; LFO rate/depth/dest; glide; unison voices/detune.

### 1.2 Drum synth voices (P0) — one flow per voice
- **Kick** (already close): `Osc(sine,isPitch?)` with a fast **pitch env** (`ADSR`→`Osc.frequency`
  via `Gain`, big amount, short decay = the "click→thud") → `VCA` (amp ADSR, decay-only) →
  `Distortion`(drive) → out. Knobs: tune, pitch-amt, click, decay, drive.
- **Snare**: `Osc(tri ~180Hz)` + `Noise` → two `Gain`s (tone vs. noise mix) → `BiquadFilter(BP)` →
  `VCA`(short decay) → out. Knobs: tone, noise, tune, decay.
- **Hat**: `Noise` → `BiquadFilter(HP ~8k)` → `VCA`(very short decay, "closed" vs "open" = decay) →
  out; choke group handled by the host (re-trigger cuts the tail).
- **Clap**: `Noise` → `BP` → `VCA` driven by a **3–4 tap burst** (`Delay` taps or a tiny
  `Sequencer` of triggers) + a longer reverberant tail `Gain`.
- **Tom/cowbell/rim**: `Osc`(+ 2nd detuned osc for cowbell) → `VCA` → optional `BP`.

### 1.3 Sampler (P0)
```
Sample(isPitch, start,end,loop,xfade) → BiquadFilter → VCA(amp ADSR) → Master
                                            ▲              ▲
                                       FiltEnv/LFO      AmpEnv
```
- `SampleFlowNode`/`AudioBufferSource` plays the buffer at note pitch (repitch) — for true
  multisample you add **key/velocity zone** metadata picking the buffer per note (host-side, like
  the audio-clip asset system). Loop points + crossfade in node `data`.
- **Drum/pad kit** = a bank of sampler voices (per pad: sample, gain, pan, pitch, decay, choke,
  round-robin) — a kit flow with N `Sample→VCA` lanes selected by note number.

### 1.4 FM synth (P1)
- Operators = `Osc(sine)` whose **frequency is set by ratio·noteHz** (`Constant(ratio)` ·
  `noteHz` via `Function` multiply → `Osc.frequency`). **Modulation** = op output → `Gain[index]`
  → carrier `Osc.frequency` handle (audio-rate FM). Each op has its own `ADSR`→`Gain`.
- **Algorithms** = which ops feed which (graph topology) + feedback = op → `Gain` → its own freq.
- If audio-rate FM into `frequency` isn't supported by the osc node, add a tiny
  `AudioWorkletOscillator` (core already has one) as the FM-capable operator.

### 1.5 Wavetable (P1)
- `AudioWorkletOscillator` (custom) holding the table set; **position** param scanned by
  `ENV`/`LFO` → `Gain[depth]` → `osc.position`. Two tables + sub → filter → VCA. (Needs a small
  wavetable worklet node; everything around it is the standard subtractive frame.)

### 1.6 Granular (P2)
- New `Granular` worklet node (grain size/density/position/spray/pitch) reading a buffer;
  wrap: `Granular → Filter → VCA → Master`, with `LFO`→position for motion. Worklet is the only
  new DSP; patching is standard.

### 1.7 Additive (P2)
- Bank of `Osc(sine)` at harmonic ratios (`Constant`·noteHz → freq), each with a level `Gain`
  (+ per-partial `ADSR` for evolving spectra) summed → `VCA`. Heavy node count → better as one
  `AdditiveWorklet` with a partial-amplitude array.

### 1.8 Physical modeling (P2)
- Karplus-Strong: `Noise`(burst, gated by `ADSR`) → `Delay`(time = 1/noteHz) with feedback
  through a `BiquadFilter(LP)` (damping) → `VCA`. Pitch = `noteHz`→`Delay.delayTime` (via
  `Function` reciprocal). A clean, all-existing-nodes patch.

### 1.9 Vocoder instrument/FX (P1/P2)
- `Vocoder` node already exists: **carrier** = internal synth (saw/noise) `main-input`,
  **modulator** = mic/audio sidechain; bands + formant params as knobs.

### 1.10 MIDI tools
- `Arpeggiator`/`Sequencer`/`ScriptSequencer` nodes generate note/trigger streams →
  drive the instrument's pitch/trigger handles. Knobs: mode, rate(sync), octaves, gate, swing.

---

## 2. Effects (FX flows: `Input(isInput) → … → Output(isOutput)`)

### 2.1 Compressor / gate (P0) — fast win
```
Input → DynamicCompressor → makeup Gain → Output
                ▲ (optional) sidechain audio
```
- `DynamicCompressor` maps 1:1 (threshold/ratio/attack/release/knee). **Makeup** = trailing
  `Gain`. **Parallel** = `Input` split → comp + dry → mix `Gain`s. **Sidechain** = external audio
  into the compressor's detector (key) input; the host routes a chosen track's signal there.
- **Gate/expander** = a `Function` transfer (or a tiny worklet) on an envelope-follower
  (`Analyzer`/rectify→`Filter` smooth) gating the `VCA` — or a dedicated `Gate` worklet.

### 2.2 Reverb (P0 convolution / P1 algorithmic)
- **Convolution**: `Reverb`/`Convolver` node with a bundled IR set (room/hall/plate/spring),
  `Input → [dry Gain] + [Convolver → wet Gain] → Output`; pre-delay = `Delay` before the convolver;
  damping = `BiquadFilter(LP)` in the wet path. Knobs: size(IR), mix, predelay, damp.
- **Algorithmic** (no IR): FDN — 4–8 `Delay` lines (prime lengths) cross-fed through a feedback
  `Gain` matrix + `BiquadFilter(LP)` damping + input diffusion (series allpass = `IIRFilter`).
  Knobs: size, decay, damp, diffusion, mod, mix.

### 2.3 Delay — advanced (P0)
```
Input → [in Filter] → Delay ──▶ Output(wet Gain)
                        ▲   └─▶ feedback Gain → BiquadFilter → back to Delay.main-input
```
- Tempo-sync = host sets `delayTime` from BPM. **Ping-pong** = two delays L/R cross-fed.
  **Multitap** = several `Delay`s in parallel with their own level/pan. **Tape** = add a slow
  `LFO`→`Delay.delayTime` (wow/flutter) + `Distortion` in the loop (saturation/age).

### 2.4 Saturation / distortion / bitcrusher (P0)
- **Saturation/Distortion**: `Distortion` (WaveShaper) with selectable **curve** (tube/tape/diode)
  in `data`; pre-`Gain`(drive) + post-`Gain`(trim) + tone `BiquadFilter`; oversample flag.
- **Bitcrusher/decimator**: small worklet (bit-depth quantize + sample&hold rate reduce); knobs
  bits, downsample, mix. (Only the crusher needs a new node.)
- **Clipper** = `Distortion` with a hard-clip curve (`Function`-generated).

### 2.5 Modulation: chorus / flanger / phaser / tremolo / auto-pan (P0–P1)
```
Chorus/Flanger:  Input → Delay(1–30ms) → wet Gain → Output ;  LFO Osc → Gain[depth] ─▶ Delay.delayTime
                 Flanger adds feedback Gain (Delay.out → Delay.in); shorter times + resonance.
Phaser:          Input → 4–8× IIRFilter(allpass) in series → wet ;  LFO ─▶ allpass frequencies
Tremolo:         Input → Gain ;  LFO Osc → Gain.gain                (rate, depth, shape, sync)
Auto-pan:        Input → StereoPanner ;  LFO ─▶ pan
```
- Chorus "voices" = 2–3 parallel modulated delays with phase-offset LFOs.

### 2.6 EQ / filter (P0)
- **Parametric EQ**: ✅ native `EqNode` (BiquadFilter chain + Analyser) — already built.
- **Filter FX**: `Input → BiquadFilter(type) → Output`; **auto-wah/env-filter** = envelope
  follower (`Analyzer`/rectify→smooth `Filter`) → `Gain[depth]` ─▶ `Filter.frequency`; **LFO
  filter** = `LFO` → same handle.
- **Dynamic EQ** = per-band: detector (`Analyzer` on band) → modulate that band's `gain`.

### 2.7 Stereo & utility (P0)
- **Utility**: `Gain`(trim), phase invert = `Gain(-1)` or `Function`, mono-maker = sum L/R below
  a freq (split → `Filter` → mono `Gain`), pan = `StereoPanner`.
- **Widener/imager (M/S)**: encode L/R→M/S (`Function`/matrix `Gain`s), scale Side `Gain`(width),
  decode back; bass-mono via `Filter` on Side. Correlation read by `Analyzer`.

### 2.8 Pitch / ring-mod / spectral (P1–P2)
- **Ring-mod / freq-shift**: `FrequencyShifter` / `AudioSignalFreqShifter` (exist) — `Input →
  shifter → mix`. **Pitch shift/harmonizer/auto-tune** = a phase-vocoder worklet (new DSP);
  scale-aware mapping host-side.

### 2.9 Creative: gater / stutter / reverse (P2)
- **Trance gate**: `Sequencer`(step on/off) → `Gain.gain` (host BPM-synced). **Stutter/buffer-
  repeat** + **reverse** = a small buffer worklet capturing recent audio and replaying
  slices/reversed; knobs slice, rate, repeats, mix.

### 2.10 Meters & analysis (P0–P1, read-only)
- `Analyzer` (FFT) → spectrum; `Oscilloscope` → scope; LUFS/true-peak/VU/correlation =
  `Analyzer`/`Function` math feeding a meter UI (reuse the EQ's `AnalyserNode` tap pattern).

---

## 3. Cross-cutting design

- **Modulation matrix / macros:** sources (`LFO`, `ADSR`, `Constant`, envelope-follower, MIDI
  knob `MidiKnob`) → `Gain[amount]` → any target param handle. A "macro" = one `Constant`/knob
  fanned out to several `Gain[amount]` depths. This is the generic mod-matrix.
- **Tempo sync:** the host passes BPM; LFO rate / delay time / gate steps read it (like the
  Scheduler already does) so `1/8`, `1/4D`, etc. resolve to seconds.
- **What needs *new* DSP (worklets), everything else is patching with existing nodes:**
  bitcrusher, wavetable osc, granular, additive (or N-osc), pitch-shift/auto-tune, gate/stutter,
  algorithmic-reverb FDN (or use convolution). The core already ships oscillator/recorder/
  freq-shifter worklets to copy the pattern from.
- **Reuse:** the **native-FX seam** (EqNode → `FxChain`/`ResolvedFx`, works live + in bounce) is
  the cheapest path for compressor/reverb/delay/saturation/utility; the **Synflow flow** path
  (JSON graph + auto knobs) is best for synths and anything users should be able to open and rewire.
```
Native (EqNode-style)  → dynamics, reverb, delay, saturation, stereo/utility, meters
Synflow flow (JSON)    → synth engines, drum voices, modulation FX, creative FX
```
