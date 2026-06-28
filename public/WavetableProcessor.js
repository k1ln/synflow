// Wavetable oscillator + phase-distortion mode — thin AudioWorklet shell around
// the Rust/WASM DSP core (src/wasm/wavetable → public/wavetable.wasm). The
// worklet keeps frequency/position/warp AudioParams and forwards
// mode/unison/detune/envelope + the note gate to WASM via port messages.

class WavetableProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: 'a-rate' },
      { name: 'position',  defaultValue: 0,   minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
      { name: 'warp',      defaultValue: 0,   minValue: 0,  maxValue: 1,    automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.wavetable_new();
      this.pFreq = this.wasm.alloc_f32(128);
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.cfg = { mode: 0, unison: 1, detune: 12, a: 0.01, d: 0.3, s: 0.8, r: 0.3 };
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (!this.wasm) return;
      if (typeof m.mode === 'number' || typeof m.unison === 'number' || typeof m.detune === 'number' || m.env) this._config(m);
      if (m.gateOn) this.wasm.wavetable_gate_on(this.state, (typeof m.velocity === 'number' ? m.velocity : 1) || 1);
      if (m.gateOff) this.wasm.wavetable_gate_off(this.state);
    };
  }

  _view() { this.mem = new Float32Array(this.wasm.memory.buffer); }

  _config(m) {
    const c = this.cfg;
    if (typeof m.mode === 'number') c.mode = m.mode | 0;
    if (typeof m.unison === 'number') c.unison = m.unison | 0;
    if (typeof m.detune === 'number') c.detune = m.detune;
    if (m.env) { if (typeof m.env.a === 'number') c.a = m.env.a; if (typeof m.env.d === 'number') c.d = m.env.d; if (typeof m.env.s === 'number') c.s = m.env.s; if (typeof m.env.r === 'number') c.r = m.env.r; }
    this.wasm.wavetable_set_config(this.state, c.mode, c.unison, c.detune, c.a, c.d, c.s, c.r);
  }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length || !this.wasm) return true;
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    const m = this.mem;
    const n = output[0].length;

    const freq = params.frequency;
    if (freq.length > 1) m.set(freq, this.pFreq >> 2); else m[this.pFreq >> 2] = freq[0];

    this.wasm.wavetable_process(this.state, this.pFreq, freq.length, params.position[0], params.warp[0], n, sampleRate, this.pOut);

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('wavetable-processor', WavetableProcessor);
