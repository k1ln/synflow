// Zero-delay-feedback (TPT) state-variable filter with drive — thin AudioWorklet
// shell around the Rust/WASM DSP core (src/wasm/svf_drive → public/svf-drive.wasm).
// Continuous controls are AudioParams (cutoff a-rate; resonance/drive/mix k-rate);
// discrete mode/slope arrive via port.

class SvfDriveProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff',    defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0.2,  minValue: 0,  maxValue: 0.99,  automationRate: 'k-rate' },
      { name: 'drive',     defaultValue: 1,    minValue: 1,  maxValue: 20,    automationRate: 'k-rate' },
      { name: 'mix',       defaultValue: 1,    minValue: 0,  maxValue: 1,     automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.svf_new();
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
      if (d.mode !== undefined) this.wasm.svf_set_mode(this.state, (d.mode | 0));
      if (d.slope !== undefined) this.wasm.svf_set_slope(this.state, (d.slope === 2 ? 2 : 1));
      if (d.type === 'setmode' && d.value !== undefined) this.wasm.svf_set_mode(this.state, (d.value | 0));
      if (d.type === 'setslope' && d.value !== undefined) this.wasm.svf_set_slope(this.state, (+d.value === 2 ? 2 : 1));
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

    this.wasm.svf_process(
      this.state,
      this.pIn, inCh ? 1 : 0,
      this.pCut, cut.length,
      params.resonance[0],
      params.drive[0],
      params.mix[0],
      n, sampleRate,
      this.pOut,
    );

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('svf-drive-processor', SvfDriveProcessor);
