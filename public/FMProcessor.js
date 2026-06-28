// 6-operator FM voice — thin AudioWorklet shell around the Rust/WASM DSP core
// (src/wasm/fm_synth → public/fm.wasm). The worklet keeps the `frequency`
// AudioParam (pitch glide) and forwards operator config + the note gate to WASM
// via port messages.

class FMProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: 'a-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.fm_new();
      this.pRatios = this.wasm.alloc_f32(6);
      this.pLevels = this.wasm.alloc_f32(6);
      this.pFreq = this.wasm.alloc_f32(128);
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (!this.wasm) return;
      if (Array.isArray(m.ratios) || Array.isArray(m.levels) || typeof m.feedback === 'number' || typeof m.algorithm === 'number' || m.env) {
        this._config(m);
      }
      if (m.gateOn) this.wasm.fm_gate_on(this.state, (typeof m.velocity === 'number' ? m.velocity : 1) || 1);
      if (m.gateOff) this.wasm.fm_gate_off(this.state);
    };
    // last-known config so partial updates keep the rest
    this.cfg = { ratios: [1, 1, 1, 1, 1, 1], levels: [1, 0, 0, 0, 0, 0], feedback: 0, algorithm: 1, a: 0.005, d: 0.3, s: 0.7, r: 0.3 };
  }

  _view() { this.mem = new Float32Array(this.wasm.memory.buffer); }

  _config(m) {
    const c = this.cfg;
    if (Array.isArray(m.ratios)) for (let i = 0; i < 6; i++) if (typeof m.ratios[i] === 'number') c.ratios[i] = m.ratios[i];
    if (Array.isArray(m.levels)) for (let i = 0; i < 6; i++) if (typeof m.levels[i] === 'number') c.levels[i] = m.levels[i];
    if (typeof m.feedback === 'number') c.feedback = m.feedback;
    if (typeof m.algorithm === 'number') c.algorithm = m.algorithm | 0;
    if (m.env) { if (typeof m.env.a === 'number') c.a = m.env.a; if (typeof m.env.d === 'number') c.d = m.env.d; if (typeof m.env.s === 'number') c.s = m.env.s; if (typeof m.env.r === 'number') c.r = m.env.r; }
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    this.mem.set(c.ratios, this.pRatios >> 2);
    this.mem.set(c.levels, this.pLevels >> 2);
    this.wasm.fm_set_config(this.state, this.pRatios, this.pLevels, c.feedback, c.algorithm, c.a, c.d, c.s, c.r);
  }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length || !this.wasm) return true;
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    const m = this.mem;
    const n = output[0].length;

    const freq = params.frequency;
    if (freq.length > 1) m.set(freq, this.pFreq >> 2); else m[this.pFreq >> 2] = freq[0];

    this.wasm.fm_process(this.state, this.pFreq, freq.length, n, sampleRate, this.pOut);

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('fm-processor', FMProcessor);
