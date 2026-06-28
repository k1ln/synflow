// Audio-rate ADSR envelope generator — thin AudioWorklet shell around the
// Rust/WASM core (src/wasm/envgen → public/envgen.wasm). Emits an envelope
// *signal* (bias + amount*ADSR) so it can drive any param handle, including the
// worklet ladder/SVF cutoff that the scheduler-based ADSR node can't reach.

class EnvGenProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack',  defaultValue: 0.01, minValue: 0, maxValue: 10,    automationRate: 'k-rate' },
      { name: 'decay',   defaultValue: 0.2,  minValue: 0, maxValue: 10,    automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0.5,  minValue: 0, maxValue: 1,     automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.3,  minValue: 0, maxValue: 10,    automationRate: 'k-rate' },
      { name: 'amount',  defaultValue: 1,    minValue: -20000, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'bias',    defaultValue: 0,    minValue: -20000, maxValue: 20000, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.env_new();
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (!this.wasm) return;
      if (d.gateOn) this.wasm.env_gate_on(this.state);
      if (d.gateOff) this.wasm.env_gate_off(this.state);
    };
  }

  _view() { this.mem = new Float32Array(this.wasm.memory.buffer); }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length || !this.wasm) return true;
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    const m = this.mem;
    const n = output[0].length;

    this.wasm.env_process(
      this.state, n, sampleRate, this.pOut,
      params.attack[0], params.decay[0], params.sustain[0], params.release[0],
      params.amount[0], params.bias[0],
    );

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let c = 0; c < output.length; c++) output[c].set(block);
    return true;
  }
}

registerProcessor('envgen-processor', EnvGenProcessor);
