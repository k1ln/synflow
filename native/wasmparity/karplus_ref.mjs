// M3 reference: drive the SAME public/karplus.wasm through V8 (Node's
// WebAssembly), exactly like public/KarplusProcessor.js — karplus_new(sr) once,
// a single pluck before block 0, then per-block karplus_process with a constant
// frequency (freq_len 1). Writes build/ref_karplus.f32. The C++ side
// (karplus_cpp) hosts the identical module via wasmtime; outputs must be
// bit-identical (extends the M0 V8==wasmtime proof to a real module).
import fs from 'node:fs';

const SR = 48000, BLOCK = 128, BLOCKS = 64; // 8192 samples
const FREQ = 220.0, DECAY = 0.6, TONE = 0.6, VEL = 1.0;

const wasmPath = new URL('../../public/karplus.wasm', import.meta.url);
const buildDir = new URL('./build/', import.meta.url);
fs.mkdirSync(buildDir, { recursive: true });

const bytes = fs.readFileSync(wasmPath);
const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
const e = inst.exports;

const state = e.karplus_new(SR);
const pFreq = e.alloc_f32(BLOCK);
const pIn = e.alloc_f32(BLOCK);
const pOut = e.alloc_f32(BLOCK);
let mem = new Float32Array(e.memory.buffer);

e.karplus_pluck(state, VEL); // before block 0

const out = new Float32Array(BLOCK * BLOCKS);
for (let b = 0; b < BLOCKS; b++) {
  if (mem.buffer !== e.memory.buffer) mem = new Float32Array(e.memory.buffer);
  mem[pFreq >> 2] = FREQ;
  e.karplus_process(state, pFreq, 1, DECAY, TONE, pIn, 0, BLOCK, SR, pOut);
  out.set(mem.subarray(pOut >> 2, (pOut >> 2) + BLOCK), b * BLOCK);
}

fs.writeFileSync(new URL('ref_karplus.f32', buildDir), Buffer.from(out.buffer));
console.log(`ref karplus: ${out.length} samples (freq=${FREQ} decay=${DECAY} tone=${TONE})`);
