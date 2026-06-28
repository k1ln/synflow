// M0 gate — null-test: worklet/V8 output vs wasmtime/native output.
// Passes iff max abs sample diff < EPS. This is the hard gate before any port.
import fs from 'node:fs';

const EPS = 1e-6;
const buildDir = new URL('./build/', import.meta.url);
const readF32 = (name) => {
  const b = fs.readFileSync(new URL(name, buildDir));
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

const js = readF32('out_js.f32');
const native = readF32('out_native.f32');

if (js.length !== native.length) {
  console.error(`✗ length mismatch: js=${js.length} native=${native.length}`);
  process.exit(1);
}

let maxDiff = 0;
let argmax = -1;
for (let i = 0; i < js.length; i++) {
  const d = Math.abs(js[i] - native[i]);
  if (d > maxDiff) { maxDiff = d; argmax = i; }
}

const bitExact = maxDiff === 0;
console.log(`samples: ${js.length}`);
console.log(`max abs diff: ${maxDiff.toExponential(3)} at sample ${argmax}`);
console.log(`bit-exact: ${bitExact}`);

if (maxDiff < EPS) {
  console.log(`✓ PASS — V8 (worklet) and wasmtime (native) agree within ${EPS}`);
  process.exit(0);
} else {
  console.error(`✗ FAIL — diff ${maxDiff.toExponential(3)} >= ${EPS}`);
  process.exit(1);
}
