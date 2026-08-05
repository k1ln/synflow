#!/usr/bin/env node
// Compile each native-node AssemblyScript source (ABI v2, see abi.ts) to a
// wasm module in native/plugin/resources/, the same way src/host/compileWorklet.ts
// compiles user AudioWorklets: prepend the shared ABI runtime as plain text,
// then asc.compileString with runtime:stub + use:['abort='] so the module has
// NO host imports (wasmtime hosts it identically to the browser).
//
// Usage: node native/wasm-src/build.mjs [name ...]   (default: all NODES)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'plugin', 'resources');

// name -> source file (without .ts). Add an entry here for every ported node.
const NODES = {
  gain: 'gain.ts',
  ringmod: 'ringmod.ts',
};

async function main() {
  const ascMod = await import('assemblyscript/asc');
  const asc = ascMod.default ?? ascMod;
  const abi = readFileSync(path.join(here, 'abi.ts'), 'utf8');

  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(NODES);
  mkdirSync(outDir, { recursive: true });

  for (const name of names) {
    const file = NODES[name];
    if (!file) { console.error(`unknown node "${name}" (known: ${Object.keys(NODES).join(', ')})`); process.exitCode = 1; continue; }
    const src = readFileSync(path.join(here, file), 'utf8');
    const combined = abi + '\n// ==== node: ' + name + ' ====\n' + src;
    const { binary, stderr } = await asc.compileString(combined, {
      runtime: 'stub',
      optimizeLevel: 3,
      shrinkLevel: 1,
      noAssert: true,
      use: ['abort='],
    });
    if (!binary) {
      console.error(`${name}: compile failed\n` + (stderr ? stderr.toString() : 'unknown error'));
      process.exitCode = 1;
      continue;
    }
    const outPath = path.join(outDir, `${name}.wasm`);
    writeFileSync(outPath, binary);
    console.log(`${name}: OK -> ${path.relative(process.cwd(), outPath)} (${binary.length} bytes)`);
  }
}

main();
