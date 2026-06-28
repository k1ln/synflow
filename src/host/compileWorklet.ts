// Compile a user AudioWorklet (authored in AssemblyScript) to a WASM module that
// follows the canonical M0 DSP ABI — the SAME contract the native engine's
// WasmWorkletNode and the built-in DSP modules use. This runs at EXPORT time only
// (browser or node); the live web engine (@synflow/core) is never touched. The
// resulting wasm is embedded in the portable flow (node.data.wasmBase64) so the
// native plugin renders the worklet, and a generated JS shim (workletWasmShim.ts)
// runs the very same bytes inside the web AudioWorklet — web and native stay in sync.
//
// The user only writes `userSample(x: f32, i: i32): f32` (per-sample DSP, with module
// globals for state and `param(id)` / `sampleRate()` helpers), or exports their own
// `process(state, inPtr, outPtr, frames, ch)` for full block control.

// Canonical-ABI runtime injected before the user's AssemblyScript.
const WORKLET_ABI_PREAMBLE = `
// ==== canonical worklet ABI (auto-injected) ====
const _BUF = new StaticArray<f32>(8192);
let _used: i32 = 0;
let _sr: f32 = 48000;
const _params = new StaticArray<f32>(128);

export function init(sampleRate: f32, maxBlock: i32): i32 { _sr = sampleRate; _used = 0; return 0; }
export function alloc_f32(n: i32): i32 { const base = changetype<i32>(_BUF) + (_used << 2); _used += n; return base; }
export function set_param(state: i32, id: i32, v: f32): void { if (id >= 0 && id < 128) _params[id] = v; }
// @ts-ignore: AssemblyScript decorator
@inline function param(id: i32): f32 { return id >= 0 && id < 128 ? _params[id] : 0; }
// @ts-ignore: AssemblyScript decorator
@inline function sampleRate(): f32 { return _sr; }
`;

const DEFAULT_PROCESS = `
export function process(state: i32, inPtr: i32, outPtr: i32, frames: i32, ch: i32): void {
  for (let i: i32 = 0; i < frames; i++) {
    store<f32>(outPtr + (i << 2), userSample(load<f32>(inPtr + (i << 2)), i));
  }
}
`;

/** Prepend the canonical-ABI runtime to the user's AssemblyScript source. The default
 *  block `process` (calling userSample) is only added when the user didn't export one. */
export function wrapWorkletSource(userSource: string): string {
  const userHasProcess = /export\s+function\s+process\s*\(/.test(userSource);
  return WORKLET_ABI_PREAMBLE + (userHasProcess ? '' : DEFAULT_PROCESS) + '\n// ==== user code ====\n' + userSource;
}

function bytesToBase64(bytes: Uint8Array): string {
  // browser-safe standard base64 (no Buffer dependency)
  const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let val = 0;
  let bits = -6;
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i];
    bits += 8;
    while (bits >= 0) {
      out += TABLE[(val >> bits) & 0x3f];
      bits -= 6;
    }
  }
  if (bits > -6) out += TABLE[(val << -bits) & 0x3f]; // remaining bits, left-padded
  while (out.length % 4) out += '=';
  return out;
}

export interface WorkletCompileResult { bytes: Uint8Array; base64: string; }

/** Compile a user AudioWorklet (AssemblyScript) to canonical-ABI wasm. Throws on a
 *  compile error (message includes the asc diagnostics). Works in browser and node. */
export async function compileWorkletToWasm(userSource: string): Promise<WorkletCompileResult> {
  const ascMod: any = await import('assemblyscript/asc');
  const asc = ascMod.default ?? ascMod;
  const { binary, stderr } = await asc.compileString(wrapWorkletSource(userSource), {
    runtime: 'stub',      // no GC — a bump allocator over a static buffer
    optimizeLevel: 3,
    shrinkLevel: 1,
    noAssert: true,
    use: ['abort='],      // drop the env.abort import -> module hosts with NO imports
  });
  if (!binary) throw new Error('AudioWorklet compile failed:\n' + (stderr ? stderr.toString() : 'unknown error'));
  const bytes = binary as Uint8Array;
  return { bytes, base64: bytesToBase64(bytes) };
}
