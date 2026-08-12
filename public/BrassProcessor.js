// Brass — thin AudioWorklet shell around the Rust/WASM DSP core
// (src/wasm/brass → public/brass.wasm), a lip-reed brass instrument waveguide
// ported from STK's Brass class. `frequency` is the pitch AudioParam (a-rate);
// tension/slide/attack/release/vibratoRate/vibratoGain are k-rate knobs pushed
// via port messages (no AudioParams for these — same pattern as FMProcessor's
// operator config); a note-on/off gates the breath envelope.

class BrassProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 2000, automationRate: 'a-rate' },
    ];
  }

  constructor(options) {
    super(options);
    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.state = this.wasm.brass_new(sampleRate);
      this.pFreq = this.wasm.alloc_f32(128);
      this.pOut = this.wasm.alloc_f32(128);
      this._view();
    } else {
      this.wasm = null;
    }
    this.cfg = { tension: 0.5, slide: 0.5, attack: 0.05, release: 0.1, vibratoRate: 0.5, vibratoGain: 0.0 };
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (!this.wasm) return;
      if (m.noteOn) this.wasm.brass_note_on(this.state, (typeof m.velocity === 'number' ? m.velocity : 1) || 1);
      if (m.noteOff) this.wasm.brass_note_off(this.state);
      const c = this.cfg;
      if (typeof m.tension === 'number') c.tension = m.tension;
      if (typeof m.slide === 'number') c.slide = m.slide;
      if (typeof m.attack === 'number') c.attack = m.attack;
      if (typeof m.release === 'number') c.release = m.release;
      if (typeof m.vibratoRate === 'number') c.vibratoRate = m.vibratoRate;
      if (typeof m.vibratoGain === 'number') c.vibratoGain = m.vibratoGain;
    };
  }

  _view() { this.mem = new Float32Array(this.wasm.memory.buffer); }

  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!output || !output.length || !this.wasm) return true;
    if (this.mem.buffer !== this.wasm.memory.buffer) this._view();
    const m = this.mem;
    const n = output[0].length;
    const c = this.cfg;

    const freq = params.frequency;
    if (freq.length > 1) m.set(freq, this.pFreq >> 2); else m[this.pFreq >> 2] = freq[0];

    this.wasm.brass_process(
      this.state,
      this.pFreq, freq.length,
      c.tension, c.slide, c.attack, c.release, c.vibratoRate, c.vibratoGain,
      n, sampleRate,
      this.pOut,
    );

    const outOff = this.pOut >> 2;
    const block = m.subarray(outOff, outOff + n);
    for (let ch = 0; ch < output.length; ch++) output[ch].set(block);
    return true;
  }
}

registerProcessor('brass-processor', BrassProcessor);
