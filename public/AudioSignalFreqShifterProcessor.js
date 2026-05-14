const BUFFER_SIZE = 2048;

class AudioSignalFreqShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'shift', defaultValue: 0, minValue: -96, maxValue: 96, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    this._shiftOverride = null;
    this._cachedShiftSemitones = null;
    this._cachedPitchRatio = 1;

    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.pIn    = this.wasm.alloc_f32(128);
      this.pOut   = this.wasm.alloc_f32(128);
      this.pState = this.wasm.freq_shifter_new(BUFFER_SIZE);
      this.wasmMem = new Float32Array(this.wasm.memory.buffer);
    } else {
      this.wasm = null;
    }

    this.port.onmessage = (e) => {
      if (e.data?.type === 'setShift') {
        this._shiftOverride = e.data.value;
      }
    };
  }

  _refreshMemView() {
    this.wasmMem = new Float32Array(this.wasm.memory.buffer);
  }

  _getShift(parameters) {
    const p = parameters.shift;
    const semitones = this._shiftOverride !== null
      ? this._shiftOverride
      : (p.length > 0 ? p[0] : 0);
    if (semitones !== this._cachedShiftSemitones) {
      this._cachedShiftSemitones = semitones;
      this._cachedPitchRatio = Math.pow(2, semitones / 12);
    }
    return this._cachedPitchRatio;
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    if (!input || !input.length || !input[0].length) {
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
      return true;
    }
    if (!this.wasm) return true;

    if (this.wasmMem.buffer !== this.wasm.memory.buffer) this._refreshMemView();

    const pitchRatio = this._getShift(parameters);
    const inOff  = this.pIn  >> 2;
    const outOff = this.pOut >> 2;
    const frames = input[0].length;

    this.wasmMem.set(input[0], inOff);
    this.wasm.freq_shifter_process(this.pState, this.pIn, this.pOut, frames, pitchRatio);
    const src = this.wasmMem.subarray(outOff, outOff + frames);
    for (let ch = 0; ch < output.length; ch++) output[ch].set(src);
    return true;
  }
}

registerProcessor('audio-signal-freq-shifter-processor', AudioSignalFreqShifterProcessor);
