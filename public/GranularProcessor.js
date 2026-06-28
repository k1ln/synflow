// Granular "cloud" effect — thin AudioWorklet shell around the Rust/WASM DSP
// core (src/wasm/granular → public/granular.wasm). Records the input into a ring
// buffer and sprays windowed grains; six k-rate AudioParams + a `freeze` toggle.

class GranularProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'density',  defaultValue: 30,  minValue: 1,    maxValue: 200, automationRate: 'k-rate' },
      { name: 'size',     defaultValue: 120, minValue: 5,    maxValue: 500, automationRate: 'k-rate' },
      { name: 'position', defaultValue: 0.1, minValue: 0,    maxValue: 1,   automationRate: 'k-rate' },
      { name: 'spray',    defaultValue: 0.2, minValue: 0,    maxValue: 1,   automationRate: 'k-rate' },
      { name: 'pitch',    defaultValue: 1,   minValue: 0.25, maxValue: 4,   automationRate: 'k-rate' },
      { name: 'mix',      defaultValue: 1,   minValue: 0,    maxValue: 1,   automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.granular_new(sampleRate);
      this.pIn = this.wasm.alloc_f32(128);
      this.pL = this.wasm.alloc_f32(128);
      this.pR = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (!this.wasm) return;
      if (typeof d.freeze === 'boolean') this.wasm.granular_set_freeze(this.state, d.freeze ? 1 : 0);
      if (d.type === 'setfreeze') this.wasm.granular_set_freeze(this.state, (d.value && d.value !== 'false' && d.value !== 0) ? 1 : 0);
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

    this.wasm.granular_process(
      this.state,
      this.pIn, inCh ? 1 : 0,
      this.pL, this.pR,
      n,
      params.density[0], params.size[0], params.position[0],
      params.spray[0], params.pitch[0], params.mix[0],
      sampleRate,
    );

    const lOff = this.pL >> 2, rOff = this.pR >> 2;
    const l = m.subarray(lOff, lOff + n);
    const r = m.subarray(rOff, rOff + n);
    output[0].set(l);
    if (output.length > 1) output[1].set(r); else output[0].set(l);
    return true;
  }
}

registerProcessor('granular-processor', GranularProcessor);
