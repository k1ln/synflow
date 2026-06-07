# Patch cookbook — detailed designs with diagrams

Device-by-device build sheets for [SOUND-LIBRARY.md](SOUND-LIBRARY.md), patched in the Synflow
node graph. Where a classic patch exists I use the numbers from Sound On Sound's **Synth Secrets**
(Gordon Reid) — links at the bottom. Concrete settings are starting points, not gospel.

### Diagram key
```
═▶  audio signal        ┄▶  control/modulation into a param handle
[Node]  a graph node    {a|b}  pick one      ⟳ feedback
Osc=OscillatorFlowNode  Filt=BiquadFilter  VCA=Gain(+env on .gain)  Env=ADSR(isTrigger)
LFO=Osc at <20Hz        Noise=NoiseNode    →Master / Input·Output(isInput/isOutput)
```
A **synth flow = one voice** (the host VoicePool clones it; the note drives `isPitch` oscillators
and fires `isTrigger` envelopes). An **effect flow = `Input(isInput) → … → Output(isOutput)`**.

---

# PART 1 — SYNTHS & INSTRUMENTS

## 1.1 Subtractive poly synth (the workhorse)
The frame every melodic patch below specialises.
```
            ┌ Osc A (saw, isPitch) ═══╗
            ├ Osc B (saw/sq, isPitch, ║
 note ─────▶│        +detune) ════════╬═▶[Filt LP]═══▶[VCA]═══▶ Master
            ├ Sub  (sine, −1 oct) ════║       ▲          ▲
            └ Noise ══════════════════╝       ┊          ┊
 FiltEnv [Env]┄(×EnvAmt[Gain])┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘          ┊
 AmpEnv  [Env]┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
 LFO1 [Osc 0.1–8Hz]┄(×Depth[Gain])┄▶ {OscB.detune | Filt.freq | VCA.gain}
```
- **Mix:** each source → its own `Gain` (level), summed into `Filt.main-input`.
- **Filter env amount:** `Env ═▶ Gain[EnvAmt] ┄▶ Filt.frequency` (bipolar). Key-track: `Constant(noteHz)·amt ┄▶ Filt.frequency`.
- **Unison:** wrap the oscillator block in `UnisonBegin … UnisonEnd` (voices, detune, spread).
- **Knobs:** osc mix·detune·sub·noise · cutoff·reso·drive · filtEnv A/D/S/R + amount · ampEnv A/D/S/R · LFO rate/depth/dest · glide · unison.

## 1.2 Bass / sub bass
Subtractive frame, mono + glide, filter low.
```
Osc(saw or square, isPitch) ═▶[Filt LP ~150–600Hz, reso 2–4]═▶[VCA]═▶[Distortion soft]═▶Master
 FiltEnv[Env A0 D120 S0 R80]┄(×amt)┄▶Filt.freq      AmpEnv[A2 D—  S1 R40]
 Glide: portamento on note pitch.   808-sub = pure sine osc + long decay, no filter.
```
- **Reese:** two detuned saws (±12–20 cents) → narrow LP + slow LFO on detune. **FM bass:** see 1.9.

## 1.3 Lead
Subtractive frame, bright, mono/legato, expressive mod-wheel.
```
Osc A(saw)+Osc B(saw,+7 cents) ═▶[Filt LP, reso 3–5]═▶[VCA]═▶Master
 FiltEnv┄▶Filt.freq (amt mid)    LFO(5Hz tri)┄▶OscA.detune (vibrato, mod-wheel→Depth)
 Supersaw = 7 detuned saws (UnisonBegin/End, spread) → LP → VCA → chorus+reverb.
```

## 1.4 Pad
```
2–3× saw (detuned, PWM via 2 saws) ═▶[Filt LP ~½ open]═▶[VCA]═▶[Chorus]═▶[Reverb]═▶Master
 AmpEnv slow:  A 0.6–1.2s · S 0.8 · R 1.5–3s    FiltEnv slow open (A~1s)
 LFO(0.1–0.3Hz)┄▶Filt.freq (slow movement)
```

## 1.5 Strings / ensemble  ·  *SoS: Synthesizing Strings*
The trick is **beating + chorus**, not one fat osc.
```
 Osc A(saw, isPitch) ═╗
 Osc B(saw, +small detune) ═╬═▶[Filt LP ~½ closed, gentle key-follow]═▶[VCA]═▶[Ensemble]═▶Master
 (opt PWM → 4 pitches)     ║
 LFO(tri, slow)┄▶OscA.pitch (vibrato); switch LFO→S&H(random) to de-correlate beating.
 AmpEnv = trapezoid: slow Attack (crescendo) + long Release (tail).   No filter-env, no velocity.

 Ensemble = 3 short modulated delays (BBD chorus):
   Input ═╦═▶[Delay ~8ms]═(LFO φ0)═╗
          ╠═▶[Delay ~8ms]═(LFO φ120°)╬═▶ wet Gain ═▶ Output    (+ dry)
          ╚═▶[Delay ~8ms]═(LFO φ240°)╝     LFO ~0.5–6Hz ┄▶ each Delay.delayTime
```

## 1.6 Brass  ·  *SoS: Brass Synthesis on a Minimoog*
The brass is the **slow filter sweep** — filter opens slower than the amp, letting harmonics in one by one.
```
 Osc(saw, isPitch, 4' = +1 oct) ═▶[Filt LP, cutoff ~closed, reso 2/10, key-track on]═▶[VCA]═▶Master
 FiltEnv[Env  A 600ms · D 800ms · S 5/10] ┄(×Amount 6.5/10)┄▶ Filt.frequency   ← the brassy bit
 AmpEnv[A 100ms · S max · instant release]
 Optional rasp: Osc3(tri, 32', −1 fine) ┄▶ Filt.freq (audio-rate), mod-wheel→Depth.
```

## 1.7 Wind — flute / clarinet  ·  *SoS: Synthesizing Wind Instruments*
```
 Flute (open pipe):  Osc({saw|tri}, isPitch) ═╗
 Clarinet (closed):  Osc(square — odd harmonics)═╬═▶[Filt LP, key-track + opens with level]═▶[VCA]═▶Master
 Breath:  Noise ═▶[Filt BP]═▶[VCA small] ═════════╝   (air turbulence layer)
 AmpEnv: gentle Attack (breath builds) · stable Sustain · natural Release.
 LFO(5–6Hz)┄▶Osc.pitch (delayed vibrato).  "Louder ⇒ brighter": route velocity ┄▶ Filt.freq.
```

## 1.8 Organ (drawbar) + Leslie
Additive drawbars, then rotary.
```
 9× Osc(sine) at drawbar ratios (16',5⅓',8',4',2⅔',2',1⅗',1⅓',1') ═▶ sum[Gain each=drawbar]═▶[VCA]═▶[Leslie]
 Key-click: tiny Noise burst (1–2ms) added on attack.   Percussion: fast Env on 4'/2⅔'.
 Leslie (rotary): [Doppler] LFO(slow⇄fast)┄▶short Delay.time (pitch wobble) + LFO┄▶VCA.gain (tremolo),
                  two-speed ramp (chorale↔tremolo). Horn(high) vs drum(low) split by a crossover Filt.
```

## 1.9 FM synth / electric piano
```
 Operator = Osc(sine) whose freq = ratio·noteHz:  [Constant ratio]×[noteHz] (Function ×) ┄▶ Osc.frequency
 FM:  Mod Op ═▶[Gain = Index]┄▶ Carrier Osc.frequency        each Op has its own [Env].
 2-op e-piano:  ModOp(ratio 14, fast-decay Env = the "tine") ┄▶ Carrier(ratio 1) ═▶[VCA]═▶[Chorus]═▶Master
 Algorithms = which ops feed which (topology).  Feedback = Op ┄▶ its own freq via Gain.
 Use the core AudioWorkletOscillator for clean audio-rate FM into frequency.
```

## 1.10 Sampler / drum-kit sampler
```
 [Sample(isPitch, start,end,loop,xfade)] ═▶[Filt LP]═▶[VCA]═▶Master
  FiltEnv/LFO ┄▶Filt.freq      AmpEnv ┄▶VCA.gain
 Multisample: host picks the buffer by key/velocity zone (like the audio-asset system).
 Drum kit = N such lanes (per pad: sample·gain·pan·pitch·decay·choke·round-robin), note# selects lane.
```

---

# PART 2 — DRUM VOICES  (one flow per voice)

## 2.1 Kick / bass drum  ·  *SoS: Practical Bass Drum Synthesis*
Two routes — pick the pitch-env one (clearer) or the self-oscillating-filter one (classic).
```
A) Pitch-env:  Osc(sine) ═▶[VCA]═▶[Distortion drive]═▶Master
   PitchEnv[Env A0 · D 60–120ms · S0] ┄(×big amt)┄▶ Osc.frequency   (≈110Hz→45Hz sweep = click→thud)
   AmpEnv[A0 · D 200–400ms · S0 · R—]                Click = the instant VCA attack edge.
B) Self-osc filter (ARP/SH101):  Noise/Osc ═▶[Filt LP reso=MAX, cutoff=min]═▶[VCA]═▶Master
   Env(~50–60% amount) ┄▶ Filt.freq;  filter self-oscillates and sweeps down = the drum.
 Knobs: tune · pitch-amt · click · decay · drive.
```

## 2.2 Snare  ·  *SoS: Practical Snare Drum Synthesis* (≈35% tone / 65% noise)
```
 Osc(tri ~180Hz) ═▶[Gain ×0.35]═╗
                                ╠═▶[Filt BP]═▶[VCA]═▶Master
 Noise ═▶[Filt HP ~1–2kHz] ═════╝
 AmpEnv: A0 · D ~120–200ms · S0 (snappy).   Optional FM rasp: tri/sq modulator ┄▶ pulse carrier.freq.
 Knobs: tone · noise · tune · decay.
```

## 2.3 Hi-hat (closed/open) & cymbal
```
 Noise ═▶[Filt HP ~8–10kHz]═▶[VCA]═▶Master    (metallic = 6 square Oscs at inharmonic ratios → HP, 808-style)
 AmpEnv: A0 · D = 30–60ms (closed) / 300–800ms (open) · S0.   Choke: re-trigger cuts tail (host group).
```

## 2.4 Clap
```
 Noise ═▶[Filt BP ~1kHz]═▶[VCA]═▶[Reverb short]═▶Master
 VCA driven by a 3–4 burst envelope (tiny Sequencer/Delay taps ~10ms apart) + one longer tail.
```

## 2.5 Tom / cowbell / rim
```
 Tom:     Osc(sine, pitch-env down) ═▶[VCA decay]═▶Master
 Cowbell: Osc(sq ~560Hz)+Osc(sq ~845Hz) ═▶[Filt BP]═▶[VCA short]═▶Master   (the 808 two-square trick)
 Rim:     Noise+Osc click ═▶[Filt BP high]═▶[VCA very short]
```

---

# PART 3 — EFFECTS  (`Input(isInput) → … → Output(isOutput)`)

## 3.1 Compressor / gate
```
 Input ═╦═════════════════════════════╗
        ╚═▶[DynamicCompressor]═▶[Gain makeup]═╬═▶ mix(parallel) ═▶ Output
 sidechain audio ┄▶ compressor key (host routes a track)        ⟂ GR meter via Analyzer
 Gate: envelope follower (Analyzer→rectify→smooth Filt) ┄▶ VCA.gain through a Function threshold.
 Knobs: threshold·ratio·attack·release·knee·makeup·mix(·sidechain).
```

## 3.2 Reverb
```
 Convolution:  Input ═╦═(dry Gain)═══════════════╗
                      ╚═▶[Delay predelay]═▶[Convolver IR]═▶[Filt LP damp]═▶(wet Gain)═╬═▶ Output
 Algorithmic (FDN):   Input ═▶[allpass ×2 diffuse]═▶ 4–8×[Delay prime]⟳[Gain matrix]═▶[Filt LP damp]═▶ wet
 Knobs: size(IR)·decay·predelay·damp·diffusion·mod·mix.
```

## 3.3 Delay
```
 Input ═▶[Filt in]═▶[Delay]═╦═══════════════▶ (wet Gain) ═▶ Output
                            ╚⟳[Gain feedback]═▶[Filt LP]═▶ back to Delay.main-input
 Sync: host sets delayTime from BPM (1/8, 1/4D…).  Ping-pong = 2 cross-fed delays (L/R).
 Multitap = parallel Delays w/ own level+pan.  Tape = LFO┄▶Delay.time (wow) + Distortion in loop.
```

## 3.4 Saturation / distortion / bitcrusher
```
 Input ═▶[Gain drive]═▶[Distortion curve={tube|tape|diode|hardclip}]═▶[Filt tone]═▶[Gain trim]═▶ Output
 Bitcrusher = small worklet (bit-quantize + sample&hold downsample) in place of Distortion.
 Knobs: drive·tone·mix·(bits·downsample).   Curve generated by a Function.
```

## 3.5 Modulation FX
```
 Chorus:  Input ═╦═(dry)══════════════════════════════╗
                 ╚═▶[Delay 1–30ms]═(wet) ═════════════╬═▶ Output ;  LFO┄(×Depth)┄▶Delay.time
                  (2–3 parallel delays w/ phase-offset LFOs = richer)
 Flanger: as chorus, shorter time + ⟳[Gain feedback] (resonant whoosh).
 Phaser:  Input ═▶[IIRFilter allpass]×4–8═▶ wet ;  LFO┄▶ allpass frequencies ;  +feedback.
 Tremolo: Input ═▶[VCA] ; LFO┄▶VCA.gain.      Auto-pan: Input ═▶[StereoPanner] ; LFO┄▶pan.
 Knobs: rate(sync)·depth·feedback·mix·shape.
```

## 3.6 Filter FX / auto-wah
```
 Input ═▶[Filt {LP|HP|BP|notch}]═▶ Output
 Auto-wah:  env follower (Analyzer→rectify→smooth) ┄(×Depth)┄▶ Filt.frequency  (or LFO for auto-wah pan)
 Knobs: type·cutoff·reso·env/LFO depth·attack.
```

## 3.7 Stereo & utility
```
 Utility: [Gain trim] · phase = Gain(−1)/Function · pan = StereoPanner · mono = sum L+R.
 M/S widener:  L,R ═▶[Function/Gain matrix → M,S] ; Side ═▶[Gain ×Width] ; (bass-mono = Filt on Side) ═▶ decode L,R.
 Correlation/level read by Analyzer (meter UI).
```

## 3.8 Pitch / ring-mod / spectral
```
 Ring-mod / freq-shift: Input ═▶[FrequencyShifter | AudioSignalFreqShifter]═▶ mix ═▶ Output   (nodes exist)
 Pitch-shift / harmonizer / auto-tune: phase-vocoder worklet (new DSP); scale mapping host-side.
```

## 3.9 Creative & meters
```
 Trance gate: [Sequencer step on/off]┄▶VCA.gain (BPM-synced).   Stutter/reverse: buffer worklet replays slices.
 Meters: [Analyzer] FFT→spectrum · [Oscilloscope]→scope · LUFS/true-peak/VU/correlation = Analyzer+Function → meter UI.
```

---

## Build-effort note
**Pure patching (existing nodes):** all synths/drums, compressor, gate, reverb (convolution), delay,
distortion/saturation, chorus/flanger/phaser, tremolo/auto-pan, filter/auto-wah, ring-mod, stereo/utility, meters.
**Needs a small new worklet:** bitcrusher, wavetable osc, granular, pitch-shift/auto-tune, gate/stutter,
FDN algorithmic reverb (or just use convolution). The core already ships oscillator/recorder/freq-shifter
worklets to copy the pattern from.

## Sources (Sound On Sound — Synth Secrets, Gordon Reid)
- [Synth Secrets — full series](https://www.soundonsound.com/series/synth-secrets-sound-sound)
- [Practical Bass Drum Synthesis](https://www.soundonsound.com/techniques/practical-bass-drum-synthesis)
- [Practical Snare Drum Synthesis](https://www.soundonsound.com/techniques/practical-snare-drum-synthesis)
- [Synthesizing Drums: The Snare Drum](https://www.soundonsound.com/techniques/synthesizing-drums-snare-drum)
- [Brass Synthesis On A Minimoog](https://www.soundonsound.com/techniques/brass-synthesis-minimoog)
- [Synthesizing Wind Instruments](https://www.soundonsound.com/techniques/synthesizing-wind-instruments)
- [Synthesizing Strings & String Machines](https://www.soundonsound.com/techniques/synthesizing-strings-string-machines)
- [Synthesizing Percussion](https://www.soundonsound.com/techniques/synthesizing-percussion)
