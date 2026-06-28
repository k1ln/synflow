# Synflow → Native Plugin: Architecture Recap

Design exploration for turning Synflow into a downloadable native plugin (VST3 / AU / CLAP)
while keeping the existing web app as the authoring tool.

## Decisions

1. **Keep the web UI** as the authoring/IDE. The **flow JSON is the interchange format** —
   `nodes` + `edges` (named `sourceHandle`/`targetHandle`) + `knobs[]`. The web app does not
   change; the native side is a second implementation of the same graph contract.

2. **JUCE for the plugin shell.** Exports **AU + AUv3 + VST3 + AAX + standalone** from one
   codebase — the AU/Logic support nih-plug cannot provide. (nih-plug was the alternative; it
   reuses Rust DSP directly but is CLAP+VST3 only, VST3 is GPLv3-encumbered, and there's no AU.)

3. **Plugin GUI = React in a webview.** JUCE 8 makes this first-class: `WebBrowserComponent` +
   relay/attachment classes (`WebSliderRelay`, `WebSliderParameterAttachment`, etc.) provide a
   built-in parameter bridge with host automation, gestures, and preset recall handled. Serve a
   stripped React build (the existing `InstrumentPanel` / `CustomInstrumentUI` faceplate, not the
   XYFlow editor) via `Options::withResourceProvider` — no localhost server needed. The webview is
   GUI-only and never touches audio.
   - **"Synflow light":** serve a trimmed XYFlow editor into the same webview with a faceplate/edit
     toggle, so users can make small graph adjustments inside the plugin. Plugin saved state =
     the full flow JSON, so in-DAW edits persist with the song.

4. **WASM as the universal DSP substrate.** The same `.wasm` runs in the browser AudioWorklet
   (already done today) and in the C++ plugin via an embedded runtime (**wasmtime** for JIT/near-native,
   **wasm3** for a tiny deterministic interpreter). One host ABI — `process(inPtr, outPtr, frames, params…)`
   over linear memory — shared by both → bit-identical behavior, which guarantees "it sounds like
   what I tried in the browser."

5. **User-authored buffer DSP in a general-purpose language → WASM.** Not a music language.
   **AssemblyScript** (TypeScript-like, compiles to WASM in-browser, feels like the JS written in
   worklets today) is the recommended default; C/C++→WASM is the higher-ceiling alternative.
   Users write plain imperative buffer math; it runs the same in both environments.
   - **Performance:** ~1.5–2× native for scalar DSP (mostly the WASM tax, not AssemblyScript
     specifically — C→wasm sits in the same band). 2–5× on vectorizable kernels left scalar;
     ~1.3× if you hand-write wasm SIMD (`v128`) on hot paths. Negligible per node; only matters
     for FFT/convolution-class workloads. In the browser it's typically *faster* than the current
     JS-in-worklet (no GC, no deopts).

## The existing code already does half of this

- Flows are JSON IR with a `knobs[]` array (`param/label/min/max/default`) that maps directly to
  plugin parameters. `flowKnobs()` / `knob01` / `knobValue` are generic and reusable.
- `VirtualNodeFactory` is a `switch(node.type)` — the native engine mirrors this switch.
- 11 of 12 AudioWorklets are thin glue shims around **Rust DSP crates** in `src/wasm/` (karplus,
  fm_synth, granular, ladder_filter, svf_drive, freq_shifter, envgen, noise_generator, wavetable,
  hard_sync_oscillator, recorder). The `.js` worklet files are throwaway; the DSP carries over.

## Node taxonomy (drives the porting effort)

- **Bucket A — WASM/Rust DSP** (karplus, fm_synth, granular, …): nearly free to reuse via FFI
  (cbindgen → static lib) or by running the existing `.wasm` in the embedded runtime.
- **Bucket B — Web Audio builtins** (Gain, Delay, BiquadFilter, DynamicsCompressor, Convolver/Reverb,
  WaveShaper/Distortion, IIR, Analyzer): reimplement natively. Most are standard (Biquad = RBJ);
  JUCE `dsp` module covers many. Convolver and the Web Audio compressor need care to match the sound.
- **Bucket C — control/event nodes** (Sequencer, Clock, Arpeggiator, ADSR-trigger, Button, etc.):
  the **hard part**. The EventBus is async JS — it must be rewritten as a deterministic,
  sample-stamped clock driven by host transport + MIDI. Same difficulty class as live-editing hot-swap.

## Cross-cutting engineering

- **Realtime hygiene:** compile/instantiate **off the audio thread**, atomic-swap into the live
  node; no allocation/locks in `process`; bound execution (wasmtime fuel/epoch); sanitize NaN/Inf +
  denormals every block (FTZ/DAZ); WASM sandbox means user code can't crash the host DAW.
- **128-frame assumption:** worklets assume exactly 128 frames; JUCE block size is host-chosen and
  variable. Either make the DSP block-size-agnostic, or chunk the JUCE buffer into 128-sample
  sub-blocks (lowest effort, reuses DSP unchanged).
- **Param smoothing:** Web Audio auto-smooths AudioParams; natively use `juce::SmoothedValue`.

## Delivery model

- **Pre-built "player" plugin (recommended):** build ONE JUCE plugin (AU/VST3/CLAP) per platform,
  once, that embeds the WASM runtime and loads a flow JSON + user `.wasm` at runtime. The browser
  "download" hands the user the small JSON/wasm. No per-user compilation. **This replaces per-effect
  VST3 development entirely** — VST3 is built once, forever.
- **Cloud compile (later, optional):** RNBO-style — server compiles a standalone branded plugin per
  patch. Needs build infra + macOS runners + code signing (Developer ID + notarization on macOS,
  Authenticode on Windows). Pay the signing cost per build instead of per release.
- You cannot compile a native plugin in the browser — native binaries need a native toolchain on a
  real OS. The browser is the trigger/download UI only.

## Recommended first step

Build a proof-of-concept **ABI both ways**: one AssemblyScript `process(inPtr, outPtr, n, …)` module
running in the browser worklet AND in a JUCE/wasmtime host, producing identical output. This
de-risks the whole plan (HTML frontend + native engine + browser/native parity) before committing
to the larger port.

## Market references

- **RNBO** (Cycling '74) — visual patch → exported native plugin. The closest match to the end goal.
- **Cardinal / VCV Rack** — node-graph modular synth shipped as CLAP/VST3 (FOSS; good reference for
  the live-mutable realtime graph).
- **Reaktor** — visual instrument/FX builder with knobs, runs as a plugin.
- **Faust / Cmajor** — DSP languages that compile to WASM (browser) and JIT natively (C++); rejected
  here only because a general-purpose, non-music language was wanted.
- **Elementary Audio** — JS/TS DSP that runs in web (WASM) and native; open core + commercial runtime.
- **Frameworks:** JUCE (chosen, C++, all formats), nih-plug (Rust, CLAP+VST3, no AU), Pamplejuce
  (JUCE+CMake+webview template — good starting point).
