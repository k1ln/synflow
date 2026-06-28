// Null-test the wasmtime-hosted C++ engine output against the V8 reference for
// each wasm module. Same dB verdicts as the Web Audio harness: < -60 PASS.
// These should be BIT-EXACT (0 diff) — same wasm bytecode, wasmtime==V8.
import fs from 'node:fs';

const buildDir = new URL('./build/', import.meta.url);
const readF32 = (name) => {
  const b = fs.readFileSync(new URL(name, buildDir));
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const rms = (v) => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s / v.length); };

const modules = ['karplus'];
console.log('module'.padEnd(16), 'maxDiff'.padStart(11), 'errVsRef'.padStart(11), '  verdict');
console.log('-'.repeat(52));
for (const m of modules) {
  let ref, cpp;
  try { ref = readF32(`ref_${m}.f32`); cpp = readF32(`cpp_${m}.f32`); }
  catch { console.log(m.padEnd(16), 'missing output'); continue; }
  const n = Math.min(ref.length, cpp.length);
  let maxDiff = 0;
  const err = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = ref[i] - cpp[i]; err[i] = d; if (Math.abs(d) > maxDiff) maxDiff = Math.abs(d); }
  const db = 20 * Math.log10((rms(err) / (rms(ref) || 1e-12)) + 1e-20);
  const verdict = db < -60 ? '\x1b[32mPASS\x1b[0m' : db < -20 ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const exact = maxDiff === 0 ? ' \x1b[32m(bit-exact)\x1b[0m' : '';
  console.log(m.padEnd(16), maxDiff.toExponential(3).padStart(11), `${db.toFixed(1)} dB`.padStart(11), '  ' + verdict + exact);
}
console.log('-'.repeat(52));
