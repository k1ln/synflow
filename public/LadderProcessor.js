// Moog-style transistor-ladder low-pass — thin AudioWorklet shell around the
// Rust/WASM DSP core (src/wasm/ladder_filter → public/ladder.wasm). The worklet
// keeps its AudioParams (cutoff a-rate, resonance/drive k-rate) and the discrete
// `poles` (via port), and hands the per-sample DSP to WASM for performance.

class LadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff',    defaultValue: 1200, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0.3,  minValue: 0,  maxValue: 1,     automationRate: 'k-rate' },
      { name: 'drive',     defaultValue: 1,    minValue: 0.1, maxValue: 20,   automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.ladder_new();
      this.pIn = this.wasm.alloc_f32(128);
      this.pCut = this.wasm.alloc_f32(128);
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (!this.wasm) return;
      if (d.poles !== undefined) this.wasm.ladder_set_poles(this.state, (+d.poles === 2 ? 2 : 4));
      if (d.type === 'setpoles' && d.value !== undefined) this.wasm.ladder_set_poles(this.state, (+d.value === 2 ? 2 : 4));
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

    const cut = params.cutoff;
    if (cut.length > 1) m.set(cut, this.pCut >> 2); else m[this.pCut >> 2] = cut[0];

    this.wasm.ladder_process(
      this.state,
      this.pIn, inCh ? 1 : 0,
      this.pCut, cut.length,
      params.resonance[0],
      params.drive[0],
      n, sampleRate,
      this.pOut,
    );

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('ladder-processor', LadderProcessor);
