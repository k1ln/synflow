# M0 PoC — Canonical WASM DSP ABI, parity proof

Proves the keystone of the [native-plugin plan](../../../.claude/plans/recap-of-the-design-greedy-babbage.md):
**one wasm DSP module, authored in AssemblyScript, renders identically in the
browser AudioWorklet (V8) and in the native plugin (wasmtime — the engine JUCE
embeds).** If this holds, "it sounds like what I tried in the browser" is
guaranteed by construction.

## Result

```
samples: 48000
max abs diff: 0.000e+0
bit-exact: true
✓ PASS — V8 (worklet) and wasmtime (native) agree
```

**Bit-exact**, including a per-sample `tanh`, cross-block one-pole state, and a
deliberately non-128 block size (100) to exercise variable buffers on the ABI.

## The canonical ABI

A DSP node exports, identically callable from the worklet and from wasmtime:

```
alloc_f32(count) -> ptr                         // raw f32 scratch in linear memory
init(sampleRate, maxBlock) -> statePtr          // create an instance
set_param(statePtr, id, value)                  // continuous params by id
note_on(statePtr, vel) / note_off(statePtr)     // optional, instrument nodes (not in this PoC)
process(statePtr, inPtr, outPtr, frames, nChannels)   // VARIABLE frames, not the 128 quantum
```

Parity rule learned here: **no host-provided math.** `Math.tanh` compiles *into*
the wasm (AssemblyScript stdlib), so both runtimes execute the same instructions.
The only import is `env.abort`, a trap handler never hit on the happy path. Keep
it that way — a function import that runs on the host would break parity.

See [assembly/dsp.ts](assembly/dsp.ts) for a reference node on this ABI.

## Run it

```bash
npm install
npm run poc      # build:wasm -> render:js -> render:native -> nulltest
```

- `render-wasm.mjs` — V8 reference (stands in for the AudioWorklet). Generates
  the shared `build/input.f32` and writes `build/out_js.f32`.
- `native-render/` — Rust + wasmtime; reads the same input, writes `build/out_native.f32`.
- `nulltest.mjs` — the gate: fails unless max abs diff < 1e-6.

## Scope

This proves the ABI + numeric parity, which is where the risk lives. Wrapping
wasmtime inside a JUCE `AudioProcessor` (M4) is plumbing over the *same* engine
(wasmtime's C API), so it inherits this parity.
