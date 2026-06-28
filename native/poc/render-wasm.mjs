// M0 — V8 reference renderer (stands in for the browser AudioWorklet, same engine).
// Generates the canonical input signal, renders dsp.wasm through V8's WebAssembly,
// and writes build/input.f32 (shared with the native side) + build/out_js.f32.
import fs from 'node:fs';

const SR = 48000;
const N = SR; // 1 second
const BLOCK = 100; // deliberately NOT 128 — proves variable block size on the ABI
const DRIVE = 3.0;

const buildDir = new URL('./build/', import.meta.url);
const p = (name) => new URL(name, buildDir);

// 1. Deterministic input. Generated once here, persisted as raw f32, and read
//    verbatim by BOTH renderers so input generation is never a variable.
const input = new Float32Array(N);
for (let n = 0; n < N; n++) {
  input[n] = 0.7 * Math.sin((2 * Math.PI * 220 * n) / SR)
           + 0.3 * Math.sin((2 * Math.PI * 330 * n) / SR);
}
fs.writeFileSync(p('input.f32'), Buffer.from(input.buffer));

// 2. Load the module and assert it is parity-safe (no host-provided math).
const bytes = fs.readFileSync(p('dsp.wasm'));
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
console.log('wasm imports:', imports.length ? imports : '(none)');
const offending = imports.filter((i) => i.kind === 'function');
if (offending.length) {
  console.warn('  ⚠ function imports present — these run on the HOST and can break parity:', offending);
}

// 3. Instantiate (provide a no-op abort just in case it survived).
const instance = new WebAssembly.Instance(module, {
  env: { abort: () => { throw new Error('wasm abort()'); } },
});
const { alloc_f32, init, set_param, process, memory } = instance.exports;

// 4. Render in blocks.
const inPtr = alloc_f32(BLOCK);
const outPtr = alloc_f32(BLOCK);
const state = init(SR, BLOCK);
set_param(state, 0, DRIVE);

const out = new Float32Array(N);
for (let i = 0; i < N; i += BLOCK) {
  const frames = Math.min(BLOCK, N - i);
  new Float32Array(memory.buffer).set(input.subarray(i, i + frames), inPtr >> 2);
  process(state, inPtr, outPtr, frames, 1);
  out.set(new Float32Array(memory.buffer).subarray(outPtr >> 2, (outPtr >> 2) + frames), i);
}
fs.writeFileSync(p('out_js.f32'), Buffer.from(out.buffer));
console.log(`wrote out_js.f32 (${N} samples, block=${BLOCK}, drive=${DRIVE})`);
