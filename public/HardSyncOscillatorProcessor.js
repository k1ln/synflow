class HardSyncOscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0, maxValue: 20000 },
      { name: 'detune', defaultValue: 0, minValue: -1200, maxValue: 1200 },
      { name: 'type', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    this.phase = 0;
    this.lastSync = 0;
    this.oscType = 'sine';
    this.oscTypeIndex = 0;
    this.customTable = null;

    const wasmModule = options?.processorOptions?.wasmModule;
    if (wasmModule) {
      const instance = new WebAssembly.Instance(wasmModule);
      this.wasm = instance.exports;
      this._allocWasmBuffers();
    } else {
      this.wasm = null;
    }

    this.port.onmessage = (e) => {
      if (e.data.type === 'settype' || e.data.type === 'setType') {
        this.oscType = e.data.value;
        this.oscTypeIndex = this._oscTypeIndex();
      }
      if (e.data.type === 'setcustomtable' || e.data.type === 'setCustomTable') {
        this.customTable = e.data.value;
        this._syncCustomTable();
      }
    };
  }

  _allocWasmBuffers() {
    const w = this.wasm;
    this.pFreq   = w.alloc_f32(128);
    this.pDetune = w.alloc_f32(128);
    this.pSync   = w.alloc_f32(128);
    this.pFm     = w.alloc_f32(128);
    this.pCustom = w.alloc_f32(1024);
    this.pOut    = w.alloc_f32(128);
    this.pState  = w.alloc_f32(2);
    this._refreshMemView();
  }

  _refreshMemView() {
    this.wasmMem = new Float32Array(this.wasm.memory.buffer);
  }

  _syncCustomTable() {
    if (!this.wasm || !this.customTable) return;
    this._refreshMemView();
    this.wasmMem.set(this.customTable.subarray(0, 1024), this.pCustom >> 2);
  }

  _oscTypeIndex() {
    switch (this.oscType) {
      case 'square':   return 1;
      case 'sawtooth': return 2;
      case 'triangle': return 3;
      case 'custom':   return 4;
      default:         return 0;
    }
  }

  process(inputs, outputs, parameters) {
    const output      = outputs[0];
    if (!output || !this.wasm) return true;

    if (this.wasmMem.buffer !== this.wasm.memory.buffer) this._refreshMemView();

    const fmIn        = inputs[0];
    const syncIn      = inputs[1];
    const freq        = parameters.frequency;
    const detune      = parameters.detune;
    const syncChannel = syncIn && syncIn.length > 0 ? syncIn[0] : null;
    const fmChannel   = fmIn  && fmIn.length  > 0 ? fmIn[0]  : null;
    const blockSize   = output[0].length;
    const m           = this.wasmMem;

    if (freq.length > 1) { m.set(freq, this.pFreq >> 2); } else { m[this.pFreq >> 2] = freq[0]; }
    if (detune.length > 1) { m.set(detune, this.pDetune >> 2); } else { m[this.pDetune >> 2] = detune[0]; }

    const hasSync = syncChannel ? (m.set(syncChannel, this.pSync >> 2), 1) : 0;
    const hasFm   = fmChannel   ? (m.set(fmChannel,   this.pFm   >> 2), 1) : 0;

    this.wasm.process_block(
      this.phase,
      this.lastSync,
      sampleRate,
      this.pFreq,   freq.length,
      this.pDetune, detune.length,
      this.pSync,   hasSync,
      this.pFm,     hasFm,
      blockSize,
      this.oscTypeIndex,
      this.pCustom,
      this.pOut,
      this.pState,
    );

    const stOff = this.pState >> 2;
    this.phase    = m[stOff];
    this.lastSync = m[stOff + 1];

    const outOff = this.pOut >> 2;
    for (let ch = 0; ch < output.length; ch++) {
      output[ch].set(m.subarray(outOff, outOff + blockSize));
    }
    return true;
  }
}

registerProcessor('hard-sync-oscillator', HardSyncOscillatorProcessor);
