// Karplus–Strong plucked string — thin AudioWorklet shell around the Rust/WASM
// DSP core (src/wasm/karplus → public/karplus.wasm). A note-on (port message)
// plucks; `frequency` (a-rate), `decay`/`tone`/`attack`/`scatter`/`muffle`
// (k-rate) and an optional audio exciter input drive the WASM delay-line loop.

class KarplusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220,  minValue: 10, maxValue: 12000, automationRate: 'a-rate' },
      { name: 'decay',     defaultValue: 0.6,  minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
      { name: 'tone',      defaultValue: 0.6,  minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
      { name: 'attack',    defaultValue: 0.15, minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
      { name: 'scatter',   defaultValue: 0.3,  minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
      { name: 'muffle',    defaultValue: 0.2,  minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.karplus_new(sampleRate);
      this.pFreq = this.wasm.alloc_f32(128);
      this.pIn = this.wasm.alloc_f32(128);
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (this.wasm && d.pluck) this.wasm.karplus_pluck(this.state, (typeof d.velocity === 'number' ? d.velocity : 1) || 1);
    };
  }

  _view() { this.mem = new Float32Array(this.wasm.memory.buffer); }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length || !this.wasm) return true;
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    const m = this.mem;
    const n = output[0].length;

    const input = inputs[0];
    const inCh = (input && input[0]) ? input[0] : null;
    if (inCh) m.set(inCh, this.pIn >> 2);

    const freq = params.frequency;
    if (freq.length > 1) m.set(freq, this.pFreq >> 2); else m[this.pFreq >> 2] = freq[0];

    this.wasm.karplus_process(
      this.state,
      this.pFreq, freq.length,
      params.decay[0],
      params.tone[0],
      params.attack[0],
      params.scatter[0],
      params.muffle[0],
      this.pIn, inCh ? 1 : 0,
      n, sampleRate,
      this.pOut,
    );

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('karplus-processor', KarplusProcessor);
