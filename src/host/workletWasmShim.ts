// Generate the JS `processorCode` that runs a canonical-ABI WASM worklet INSIDE the
// web AudioWorklet. @synflow/core's VirtualAudioWorkletNode is never modified — it
// just installs whatever processorCode the node carries; here that code is a self-
// contained AudioWorkletProcessor that instantiates the embedded wasm (same bytes the
// native plugin hosts) and drives it through init/alloc_f32/process/set_param. So the
// browser preview and the native render are bit-for-bit the same module.
//
// Notes:
//  - AudioWorkletGlobalScope has no atob/Buffer, so the base64 is decoded inline.
//  - WebAssembly.Module/Instance are constructed synchronously (allowed in a worklet).
//  - Core wraps this class with registerProcessor(...) (and merges parameterDescriptors),
//    so this must DEFINE `class … extends AudioWorkletProcessor` and NOT call
//    registerProcessor itself.
//  - Params: core posts {type:'flow-param-update', name, value, id} on the port; the id
//    is the trailing integer of the param handle — the same convention the native host
//    uses — so set_param ids line up across web and native.
export function generateWorkletShim(wasmBase64: string): string {
  return `// AUTO-GENERATED: runs the embedded canonical-ABI wasm worklet (web == native).
class WasmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const B64 = '${wasmBase64}';
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lut = new Int16Array(256).fill(-1);
    for (let i = 0; i < T.length; i++) lut[T.charCodeAt(i)] = i;
    const bin = new Uint8Array((B64.length * 3) >> 2);
    let val = 0, bits = -8, p = 0;
    for (let i = 0; i < B64.length; i++) {
      const d = lut[B64.charCodeAt(i)];
      if (d < 0) continue;
      val = (val << 6) | d; bits += 6;
      if (bits >= 0) { bin[p++] = (val >> bits) & 0xff; bits -= 8; }
    }
    const bytes = bin.subarray(0, p);
    try {
      const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
      this.ex = inst.exports;
      this.state = this.ex.init ? this.ex.init(sampleRate, 128) : 0;
      this.inPtr = this.ex.alloc_f32(128);
      this.outPtr = this.ex.alloc_f32(128);
      this.ready = true;
    } catch (e) { this.ready = false; }
    this.port.onmessage = (e) => {
      const d = e && e.data;
      if (!this.ready || !d || d.type !== 'flow-param-update' || !this.ex.set_param) return;
      let id = Number.isFinite(d.id) ? (d.id | 0) : NaN;
      if (!Number.isFinite(id)) { const m = String(d.name || '').match(/(\\d+)\\s*$/); id = m ? parseInt(m[1], 10) : 0; }
      this.ex.set_param(this.state, id, +d.value || 0);
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    if (!this.ready) { // failed to load: passthrough so the graph still runs
      const input = inputs[0];
      for (let ch = 0; ch < output.length; ch++) {
        const s = input && (input[ch] || input[0]);
        if (s) output[ch].set(s);
      }
      return true;
    }
    const n = output[0].length;
    const mem = new Float32Array(this.ex.memory.buffer);
    const inBase = this.inPtr >> 2, outBase = this.outPtr >> 2;
    const src = inputs[0] && inputs[0].length ? inputs[0][0] : null;
    for (let i = 0; i < n; i++) mem[inBase + i] = src ? src[i] : 0;
    this.ex.process(this.state, this.inPtr, this.outPtr, n, output.length);
    for (let ch = 0; ch < output.length; ch++) {
      const o = output[ch];
      for (let i = 0; i < n; i++) o[i] = mem[outBase + i];
    }
    return true;
  }
}
`;
}
