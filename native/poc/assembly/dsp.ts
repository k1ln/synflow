// M0 PoC — a DSP node on the canonical WASM ABI, authored in AssemblyScript.
//
// This file is the proof that ONE wasm module, run on this ABI, produces
// bit-identical output in (a) the browser AudioWorklet / Node (V8) and
// (b) the native plugin via wasmtime. It is deliberately representative:
//  - a continuous param (`drive`, id 0),
//  - a per-sample transcendental (tanh) — to flush out any host-math import,
//  - cross-block state (a one-pole lowpass on the output) — to flush out any
//    state/aliasing divergence between runtimes.
//
// No GC, no host imports on the hot path: buffers live in linear memory and we
// use `heap.alloc` (the raw bump allocator), not managed arrays. The state is a
// hand-laid struct at byte offsets so the layout is identical everywhere.
//
// Canonical ABI (see native/poc/README.md):
//   alloc_f32(count) -> ptr
//   init(sampleRate, maxBlock) -> statePtr
//   set_param(statePtr, id, value)
//   process(statePtr, inPtr, outPtr, frames, nChannels)

// --- state layout (bytes) ---
//   0: sampleRate (f32)
//   4: drive      (f32)
//   8: z1         (f32)  one-pole lowpass state
const OFF_SR: usize = 0;
const OFF_DRIVE: usize = 4;
const OFF_Z1: usize = 8;
const STATE_BYTES: usize = 12;

const LP_COEFF: f32 = 0.05; // fixed one-pole smoothing, sample-rate-independent for the PoC

/** Allocate a raw f32 buffer in linear memory and return its byte pointer. */
export function alloc_f32(count: i32): usize {
  return heap.alloc((<usize>count) << 2);
}

/** Create a node instance; returns the state pointer the host threads back in. */
export function init(sampleRate: f32, maxBlock: i32): usize {
  const p = heap.alloc(STATE_BYTES);
  store<f32>(p + OFF_SR, sampleRate);
  store<f32>(p + OFF_DRIVE, 1.0);
  store<f32>(p + OFF_Z1, 0.0);
  return p;
}

/** Set a continuous parameter by id. id 0 = drive. */
export function set_param(statePtr: usize, id: i32, value: f32): void {
  if (id == 0) store<f32>(statePtr + OFF_DRIVE, value);
}

/** Process `frames` mono samples from inPtr -> outPtr. nChannels reserved. */
export function process(
  statePtr: usize,
  inPtr: usize,
  outPtr: usize,
  frames: i32,
  nChannels: i32,
): void {
  const drive = load<f32>(statePtr + OFF_DRIVE);
  let z = load<f32>(statePtr + OFF_Z1);
  for (let i = 0; i < frames; i++) {
    const off = (<usize>i) << 2;
    const x = load<f32>(inPtr + off);
    const y = <f32>Math.tanh(<f64>(x * drive)); // softclip
    z = z + LP_COEFF * (y - z);                  // cross-block state
    store<f32>(outPtr + off, z);
  }
  store<f32>(statePtr + OFF_Z1, z);
}
