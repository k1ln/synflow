# M3 — WASM DSP parity (wasmtime C API)

Proves the native C++ engine hosts the existing Rust→WASM DSP modules
(`src/wasm/*` → `public/*.wasm`) **bit-identically** to the browser.

- The web runs each module in an AudioWorklet over V8 (`public/*Processor.js`).
- The native engine hosts the **same `.wasm`** via the **wasmtime C API**
  (`WasmModule.h`), wrapped as an `INode` (`WasmKarplusNode.h`), and driven by
  the real `AudioGraphManager`.

Because these DSP modules have **no host imports**, wasmtime and V8 evaluate
them identically — the M0 PoC proved `dsp.wasm` is bit-exact V8 vs wasmtime, and
this extends that to the real shipped modules through the actual engine.

## Run

```sh
../third_party/fetch-wasmtime.sh   # once: download the wasmtime C API (gitignored)
./run.sh
```

Each module's C++ adapter mirrors its worklet's exact call convention
(e.g. Karplus: `karplus_new(sr)` once, a `karplus_pluck` note-on, per-block
`karplus_process` with constant `frequency` as a length-1 a-rate array).

## Status

| module  | shape        | verdict           |
|---------|--------------|-------------------|
| karplus | source+pluck | **bit-exact** (−400 dB) |

Remaining `src/wasm/*` modules (fm, granular, noise, ladder, svf_drive,
wavetable, hard_sync, freq_shifter, envgen, recorder) follow the identical
pattern — one `INode` adapter each, mirroring its worklet.
