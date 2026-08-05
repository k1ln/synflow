# native/wasm-src — AssemblyScript node DSP

The native plugin engine's DSP is migrating from hand-written C++ node classes
(`native/engine/include/synflow/nodes/*.h`) to AssemblyScript compiled to wasm,
hosted the same way VibePlugin (https://github.com/k1ln/VibePlugin) hosts its
whole engine: one wasm instance per node, driven via wasmtime, with the actual
audio math living entirely inside the wasm module. C++ becomes a thin generic
host (`GenericWasmNode`) plus the JUCE VST3/AU/CLAP/Standalone shell — it does
not know any node's DSP.

## ABI v2 (`abi.ts`)

Prepended (as plain text) to every node source before compiling. Provides:

- `init(sampleRate: f32, maxBlock: i32): void`
- `getInputPtr(port: i32): i32` / `getOutputPtr(port: i32): i32` — planar mono
  f32 buffers per port (host copies connected inputs in before `process()`,
  reads outputs after)
- `setConnected(port: i32, connected: i32): void` — host tells the module which
  input ports are actually wired this block (unconnected ports read as
  whatever the node defines for "not fed" — usually 0 or 1, node's choice)
- `setParam(id: i32, v: f32): void` — id assigned by the C++ factory registration
  (structural wiring, not DSP — see `WasmNodeFactory.cpp`)
- helpers for node code: `param(id)`, `isConnected(port)`, `inputAt(port,i)`,
  `setOutput(port,i,v)`, `sampleRate()`

A node file (e.g. `gain.ts`) must export:
- `numInputs(): i32`, `numOutputs(): i32`
- `process(frames: i32): void`

and may optionally export `noteOn(vel: f32): void` / `noteOff(): void` /
`pluck(vel: f32): void` for event-driven nodes — the C++ host uses
`WasmModule::tryFunc` so these are genuinely optional.

No host imports (`runtime: 'stub'`, `use: ['abort=']`) so wasmtime hosts the
module with zero glue, exactly like `src/host/compileWorklet.ts` already does
for user AudioWorklets — same contract, same compiler options.

## Build

```
node native/wasm-src/build.mjs            # all nodes -> native/plugin/resources/*.wasm
node native/wasm-src/build.mjs gain       # just one
```

Compiled `.wasm` files are committed to git (same as the Rust-built
karplus.wasm/ladder.wasm/etc. already in `native/plugin/resources/`) and
embedded via `juce_add_binary_data` in `native/plugin/CMakeLists.txt` — no
Node/asc dependency at plugin build time, only when re-authoring a node.

## Verify

`./verify.sh` builds a standalone harness (links `native/third_party/wasmtime`
directly, no CMake/JUCE needed — same pattern as `native/wasmparity/run.sh`)
that renders identical input through the new wasm node and the old C++ node it
replaces, and reports max-abs-diff. Currently: Gain, RingMod — both bit-exact
(diff 0.0).

## Migration status

Registered in the plugin shell (`native/plugin/src/WasmNodeFactory.cpp`, tried
*before* the built-in C++ factory in `FlowLoader.cpp`, so the plugin now
renders these via wasm while `engine_demo`/`flow_demo`/the `*_test` binaries —
which don't link wasmtime — still fall back to the old C++ class):

- [x] Gain (`gain.ts`)
- [x] RingMod (`ringmod.ts`)

Remaining C++ nodes in `native/engine/include/synflow/nodes/` to port, grouped
by how mechanical the port is:

**Tranche 2 — pure/simple audio-rate (straightforward port):**
Distortion (needs the polyphase oversampler ported too — `native/engine/include/synflow/dsp/Oversampler.h`),
BiquadFilter, IIRFilter, Delay, DynamicCompressor.

**Tranche 3 — stateful audio, more DSP surface:**
Chorus, Vocoder, Oscillator (band-limited saw/square/triangle + wavetable),
MasterOut, Mic, Passthrough, Boundary (last three are near-trivial passthrough
— may not be worth porting; they do no real DSP).

**Tranche 4 — event/control, sample-accurate scheduling:**
ADSR, Clock, Sequencer, SequencerFrequency, SpeedDivider, Switch, Constant,
Button, OnOffButton, MidiButton, MidiKnob, FlowEventFreqShifter. These are
control-rate, not audio-rate — ABI v2's per-port audio buffers still work
(most just write a constant into out[0] each block) but event *scheduling*
(GraphEvent in/out, sample-accurate NoteOn/NoteOff) isn't in ABI v2 yet and
needs a small extension (an event queue passed by pointer, or the host just
keeps event routing in C++ and the wasm module only handles the resulting
value changes — needs a design pass before starting this tranche).

**Tranche 5 — hard cases, need a design decision before porting:**
Arpeggiator, Automation, BlockingSwitch (voice allocation), UnisonBegin
(per-voice steering — arguably graph-structural, stays C++), Orchestrator
(multi-row timeline + audio-segment player), MidiFile (binary MIDI parsing),
ScriptSequencer (line-DSL interpreter), Function (JS return-expression
evaluator). AssemblyScript's `runtime: stub` has no GC and a minimal stdlib —
string/array-heavy logic like ScriptSequencer's interpreter or MidiFile's
parser is real porting work, not a mechanical translation. These were already
flagged as the hardest boundary in the pre-AS C++ architecture; moving them to
AS doesn't remove that difficulty, it just changes which language absorbs it.
Recommend tackling tranches 2-4 first and revisiting tranche 5's shape once
the ABI has been proven out on control-rate nodes.

Once a node type's AS/wasm version passes its existing test (`event_test.cpp`,
`effects_test.cpp`, `native/parity`, etc.) with the same tolerance the C++
version had, delete the old C++ class and its `#include`/registration in
`FlowLoader.cpp`'s built-in factory, and move the wasm registration from the
shell-only factory into a place `engine_demo`/tests can reach too (at that
point wasmtime stops being an optional shell-only dependency and becomes a
required dependency of `native/engine` itself — expected once most nodes are
wasm-backed, tracked as a follow-up CMake change, not done yet since Gain/
RingMod's C++ originals are still needed by the non-shell test binaries).
