#!/usr/bin/env node
/**
 * Build all WASM modules only when their Rust sources change.
 * MD5 of src/lib.rs + Cargo.toml is stored in the crate dir as .build_hash.
 */
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const CRATES = [
  {
    dir:  'src/wasm/hard_sync_oscillator',
    out:  'public/hard-sync-oscillator.wasm',
    bin:  'hard_sync_oscillator',
  },
  {
    dir:  'src/wasm/noise_generator',
    out:  'public/noise-generator.wasm',
    bin:  'noise_generator',
  },
  {
    dir:  'src/wasm/recorder',
    out:  'public/recorder.wasm',
    bin:  'recorder',
  },
  {
    dir:  'src/wasm/freq_shifter',
    out:  'public/freq-shifter.wasm',
    bin:  'freq_shifter',
  },
];

const ANSI = { reset:'\x1b[0m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m' };
const log  = (msg, c='green') => console.log(`${ANSI[c]}[WASM]${ANSI.reset} ${msg}`);
const err  = (msg)            => console.error(`${ANSI.red}[WASM]${ANSI.reset} ${msg}`);

function combinedHash(crateDir) {
  const h = crypto.createHash('md5');
  h.update(fs.readFileSync(path.join(crateDir, 'src/lib.rs')));
  h.update(fs.readFileSync(path.join(crateDir, 'Cargo.toml')));
  return h.digest('hex');
}

const CARGO_HOME = process.env.CARGO_HOME || path.join(require('node:os').homedir(), '.cargo');
const CARGO_BIN  = path.join(CARGO_HOME, 'bin');
const ENV_WITH_CARGO = { ...process.env, PATH: `${CARGO_BIN}${path.delimiter}${process.env.PATH || ''}` };

function checkRustInstalled() {
  try { execSync('cargo --version', { stdio: 'ignore', env: ENV_WITH_CARGO }); return true; }
  catch (_) { return false; }
}

function checkWasmTarget() {
  try {
    const out = execSync('rustup target list --installed', { encoding: 'utf8', env: ENV_WITH_CARGO });
    return out.includes('wasm32-unknown-unknown');
  } catch (_) { return false; }
}

function buildCrate({ dir, out, bin }) {
  const crateDir  = path.join(ROOT, dir);
  const wasmSrc   = path.join(crateDir, `target/wasm32-unknown-unknown/release/${bin}.wasm`);
  const wasmDest  = path.join(ROOT, out);
  const hashFile  = path.join(crateDir, '.build_hash');
  const srcFile   = path.join(crateDir, 'src/lib.rs');

  if (!fs.existsSync(srcFile)) {
    err(`Rust source not found: ${srcFile}`);
    process.exit(1);
  }

  const currentHash = combinedHash(crateDir);
  const storedHash  = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : '';

  if (currentHash === storedHash && fs.existsSync(wasmDest)) {
    log(`${bin}: source unchanged — skipping.`, 'gray');
    return;
  }

  log(`${bin}: building...`, 'yellow');
  execSync('cargo build --target wasm32-unknown-unknown --release', {
    cwd: crateDir,
    stdio: 'inherit',
    env: ENV_WITH_CARGO,
  });
  fs.copyFileSync(wasmSrc, wasmDest);
  fs.writeFileSync(hashFile, currentHash);
  log(`${bin}: output → ${out}`, 'green');
}

function main() {
  if (!checkRustInstalled()) {
    err('cargo not found — skipping WASM build. Install Rust: https://rustup.rs');
    return;
  }

  if (!checkWasmTarget()) {
    log('Installing wasm32-unknown-unknown target...', 'yellow');
    execSync('rustup target add wasm32-unknown-unknown', { stdio: 'inherit', env: ENV_WITH_CARGO });
  }

  for (const crate of CRATES) {
    try {
      buildCrate(crate);
    } catch (e) {
      err(`${crate.bin} build failed: ${e.message}`);
      process.exit(1);
    }
  }

  log('All WASM modules up to date.', 'green');
}

main();
