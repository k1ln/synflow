// ==== Synflow native-node ABI v2 (auto-injected, see native/wasm-src/README.md) ====
//
// One wasm instance per graph node — the native counterpart of a web
// AudioWorklet (one Instance per node). Planar mono f32 buffers per port: the
// host copies each connected input into getInputPtr(port) before calling
// process(), then reads getOutputPtr(port) after. No imports (runtime 'stub'
// + use:['abort=']) so wasmtime hosts it with zero host-function wiring —
// exactly the same contract src/host/compileWorklet.ts already proves out for
// user AudioWorklets.
//
// A node source file (gain.ts, ringmod.ts, ...) is prepended with this file's
// text and must export:
//   numInputs(): i32          — port count, called once after init()
//   numOutputs(): i32
//   process(frames: i32): void — read inputAt(port,i), write setOutput(port,i,v)
// and MAY export noteOn(vel: f32): void / noteOff(): void / pluck(vel: f32): void
// for event-driven nodes (the host uses WasmModule::tryFunc, so these are
// genuinely optional — omit them entirely if the node has no note behavior).

const MAX_BLOCK: i32 = 2048; // covers any real host block size (Web Audio=128, DAWs typically <=2048)
const MAX_PORTS: i32 = 4;
const MAX_PARAMS: i32 = 32;

const _inBuf = new StaticArray<f32>(MAX_PORTS * MAX_BLOCK);
const _outBuf = new StaticArray<f32>(MAX_PORTS * MAX_BLOCK);
const _params = new StaticArray<f32>(MAX_PARAMS);
const _connected = new StaticArray<i32>(MAX_PORTS);
let _sr: f32 = 48000;

export function init(sampleRate: f32, maxBlock: i32): void {
  _sr = sampleRate;
}

export function getInputPtr(port: i32): i32 {
  return changetype<i32>(_inBuf) + port * MAX_BLOCK * 4;
}

export function getOutputPtr(port: i32): i32 {
  return changetype<i32>(_outBuf) + port * MAX_BLOCK * 4;
}

export function setConnected(port: i32, connected: i32): void {
  if (port >= 0 && port < MAX_PORTS) _connected[port] = connected;
}

export function setParam(id: i32, v: f32): void {
  if (id >= 0 && id < MAX_PARAMS) _params[id] = v;
}

// @ts-ignore: AssemblyScript decorator
@inline function param(id: i32): f32 {
  return id >= 0 && id < MAX_PARAMS ? _params[id] : 0.0;
}

// @ts-ignore: AssemblyScript decorator
@inline function isConnected(port: i32): bool {
  return port >= 0 && port < MAX_PORTS && _connected[port] != 0;
}

// @ts-ignore: AssemblyScript decorator
@inline function inputAt(port: i32, i: i32): f32 {
  return load<f32>(changetype<i32>(_inBuf) + (port * MAX_BLOCK + i) * 4);
}

// @ts-ignore: AssemblyScript decorator
@inline function setOutput(port: i32, i: i32, v: f32): void {
  store<f32>(changetype<i32>(_outBuf) + (port * MAX_BLOCK + i) * 4, v);
}

// @ts-ignore: AssemblyScript decorator
@inline function sampleRate(): f32 {
  return _sr;
}
