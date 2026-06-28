const NOISE_TYPE_INDEX = { white: 0, pink: 1, brown: 2, blue: 3, violet: 4, gray: 5, velvet: 6, green: 7, infrared: 8, binary: 9, crackle: 10 };

class NoiseGeneratorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'a-rate' },
    ];
  }

  constructor(options) {
    super(options);
    this.noiseType = 0;

    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this.pOut = this.wasm.alloc_f32(128);
      const seed = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
      this.pState = this.wasm.noise_state_new(seed);
      this.wasmMem = new Float32Array(this.wasm.memory.buffer);
    } else {
      this.wasm = null;
    }

    this.port.onmessage = (e) => {
      if (e.data.type === 'setNoiseType') {
        this.noiseType = NOISE_TYPE_INDEX[e.data.value] ?? 0;
        if (this.wasm && this.pState) {
          const seed = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
          this.pState = this.wasm.noise_state_new(seed);
        }
      }
    };
  }

  _refreshMemView() {
    this.wasmMem = new Float32Array(this.wasm.memory.buffer);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !this.wasm) return true;

    if (this.wasmMem.buffer !== this.wasm.memory.buffer) this._refreshMemView();

    const gainArr = parameters.gain;
    const blockSize = output[0].length;
    this.wasm.noise_fill(this.pState, this.pOut, blockSize, this.noiseType);
    const off = this.pOut >> 2;
    const src = this.wasmMem.subarray(off, off + blockSize);
    for (let ch = 0; ch < output.length; ch++) {
      const buf = output[ch];
      for (let i = 0; i < blockSize; i++) {
        buf[i] = src[i] * (gainArr.length > 1 ? gainArr[i] : gainArr[0]);
      }
    }
    return true;
  }
}

registerProcessor('noise-generator', NoiseGeneratorProcessor);
