// Null-test the C++ engine against the Chrome Web Audio reference, per node.
// Reports max abs diff and the error RMS relative to the reference (in dB):
//   < -60 dB  PASS   (effectively identical)
//   -60..-20  WARN   (audibly close but not parity — a coefficient/algorithm gap)
//   > -20 dB  FAIL   (materially different)
import fs from 'node:fs';

const buildDir = new URL('./build/', import.meta.url);
const readF32 = (name) => {
  const b = fs.readFileSync(new URL(name, buildDir));
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const tests = JSON.parse(fs.readFileSync(new URL('./tests.json', import.meta.url)));

const rms = (v) => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s / v.length); };

let worst = 1;
console.log('test'.padEnd(28), 'maxDiff'.padStart(11), 'errVsRef'.padStart(11), '  verdict');
console.log('-'.repeat(64));
for (const t of tests) {
  let ref, cpp;
  try { ref = readF32(`ref_${t.name}.f32`); cpp = readF32(`cpp_${t.name}.f32`); }
  catch { console.log(t.name.padEnd(28), 'missing output'); continue; }
  const n = Math.min(ref.length, cpp.length);
  let maxDiff = 0;
  const err = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = ref[i] - cpp[i]; err[i] = d; if (Math.abs(d) > maxDiff) maxDiff = Math.abs(d); }
  const refRms = rms(ref) || 1e-12;
  const errRms = rms(err);
  const db = 20 * Math.log10(errRms / refRms + 1e-20);
  const verdict = db < -60 ? '\x1b[32mPASS\x1b[0m' : db < -20 ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  worst = Math.min(worst, -db);
  console.log(t.name.padEnd(28), maxDiff.toExponential(3).padStart(11), `${db.toFixed(1)} dB`.padStart(11), '  ' + verdict);
}
console.log('-'.repeat(64));
console.log('(error RMS relative to the Web Audio reference, per node)');
