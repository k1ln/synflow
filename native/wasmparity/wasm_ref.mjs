// M3 reference: drive each src/wasm module through V8 (Node's WebAssembly),
// exactly like its public/*Processor.js worklet. Writes build/input.f32 (shared,
// byte-identical to the C++ side) + build/ref_<module>.f32. The C++ side hosts
// the SAME .wasm via wasmtime; outputs must be bit-identical (M0: wasmtime==V8).
import fs from 'node:fs';

const SR = 48000, BLOCK = 128, N = 8192;
const SEED = 0x2545F4914F6CDD1Dn; // fixed noise seed (worklet randomizes; we pin)
const buildDir = new URL('./build/', import.meta.url);
fs.mkdirSync(buildDir, { recursive: true });
const wasmDir = new URL('../../public/', import.meta.url);
const load = (f) => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(new URL(f, wasmDir)))).exports;
const write = (name, arr) => fs.writeFileSync(new URL(name, buildDir), Buffer.from(Float32Array.from(arr).buffer));

// shared deterministic broadband input (mulberry32), same as the Web Audio harness
function genInput() {
  let a = 0x9e3779b9 >>> 0;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = (rnd() * 2 - 1) * 0.25;
  return v;
}
const input = genInput();
write('input.f32', input);

// --- karplus: source + pluck (KarplusProcessor.js) ---
function refKarplus() {
  const e = load('karplus.wasm');
  const state = e.karplus_new(SR);
  const pFreq = e.alloc_f32(BLOCK), pIn = e.alloc_f32(BLOCK), pOut = e.alloc_f32(BLOCK);
  e.karplus_pluck(state, 1.0);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += BLOCK) {
    const m = new Float32Array(e.memory.buffer);
    m[pFreq >> 2] = 220.0;
    e.karplus_process(state, pFreq, 1, 0.6, 0.6, pIn, 0, BLOCK, SR, pOut);
    out.set(m.subarray(pOut >> 2, (pOut >> 2) + BLOCK), i);
  }
  return out;
}

// --- ladder: effect, audio in -> out (LadderProcessor.js) ---
function refLadder() {
  const e = load('ladder.wasm');
  const state = e.ladder_new();
  e.ladder_set_poles(state, 4);
  const pIn = e.alloc_f32(BLOCK), pCut = e.alloc_f32(BLOCK), pOut = e.alloc_f32(BLOCK);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += BLOCK) {
    const m = new Float32Array(e.memory.buffer);
    m.set(input.subarray(i, i + BLOCK), pIn >> 2);
    m[pCut >> 2] = 1200.0;
    e.ladder_process(state, pIn, 1, pCut, 1, 0.3, 1.0, BLOCK, SR, pOut);
    out.set(m.subarray(pOut >> 2, (pOut >> 2) + BLOCK), i);
  }
  return out;
}

// --- svf: effect, audio in -> out (SvfDriveProcessor.js) ---
function refSvf() {
  const e = load('svf-drive.wasm');
  const state = e.svf_new();
  e.svf_set_mode(state, 0);
  e.svf_set_slope(state, 1);
  const pIn = e.alloc_f32(BLOCK), pCut = e.alloc_f32(BLOCK), pOut = e.alloc_f32(BLOCK);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += BLOCK) {
    const m = new Float32Array(e.memory.buffer);
    m.set(input.subarray(i, i + BLOCK), pIn >> 2);
    m[pCut >> 2] = 1000.0;
    e.svf_process(state, pIn, 1, pCut, 1, 0.2, 1.0, 1.0, BLOCK, SR, pOut); // resonance, drive, mix
    out.set(m.subarray(pOut >> 2, (pOut >> 2) + BLOCK), i);
  }
  return out;
}

// --- noise: source (NoiseGeneratorProcessor.js), fixed seed, white, gain 1 ---
function refNoise() {
  const e = load('noise-generator.wasm');
  const pOut = e.alloc_f32(BLOCK);
  const state = e.noise_state_new(SEED);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += BLOCK) {
    e.noise_fill(state, pOut, BLOCK, 0);
    const m = new Float32Array(e.memory.buffer);
    out.set(m.subarray(pOut >> 2, (pOut >> 2) + BLOCK), i);
  }
  return out;
}

for (const [name, fn] of [['karplus', refKarplus], ['ladder', refLadder], ['noise', refNoise], ['svf', refSvf]]) {
  write(`ref_${name}.f32`, fn());
  console.log(`ref ${name}: ${N} samples`);
}
