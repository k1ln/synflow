// WASM-backed recorder AudioWorkletProcessor.
// Falls back to pure-JS if the WASM hasn't been built yet.

const DEFAULT_FLUSH = 16384;
const MAX_BUF = 192000; // 4 s @ 48 kHz

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._flushEvery = DEFAULT_FLUSH;

    // JS fallback state
    this._chunks = [];
    this._samples = 0;

    // WASM state
    this.wasm = null;
    this.wasmMem = null;
    this.pState = 0;
    this.pIn = 0;
    this.pOut = 0;

    this._loadWasm();

    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.setFlushSamples === 'number') {
        const v = e.data.setFlushSamples | 0;
        if (v > 256) {
          this._flushEvery = v;
          if (this.wasm && this.pState) {
            this.wasm.recorder_set_flush(this.pState, v);
          }
        }
      } else if (e.data === 'flush') {
        this._doFlush();
      } else if (e.data === 'reset') {
        this._doReset();
      }
    };
  }

  async _loadWasm() {
    try {
      const resp = await fetch('/recorder.wasm');
      if (!resp.ok) return;
      const bytes = await resp.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      this.wasm = instance.exports;
      this.pIn    = this.wasm.alloc_f32(128);
      this.pOut   = this.wasm.alloc_f32(MAX_BUF);
      this.pState = this.wasm.recorder_new(this._flushEvery);
      this.wasmMem = new Float32Array(this.wasm.memory.buffer);
    } catch (_) {
      // stay in JS mode
    }
  }

  _refreshMemView() {
    this.wasmMem = new Float32Array(this.wasm.memory.buffer);
  }

  _doFlush() {
    if (this.wasm && this.pState) {
      this._flushWasm();
    } else {
      this._flushJs();
    }
  }

  _doReset() {
    if (this.wasm && this.pState) {
      this.wasm.recorder_reset(this.pState);
    } else {
      this._chunks = [];
      this._samples = 0;
    }
  }

  // ── WASM flush ─────────────────────────────────────────────────────────────

  _flushWasm() {
    if (this.wasmMem.buffer !== this.wasm.memory.buffer) this._refreshMemView();
    const count = this.wasm.recorder_flush(this.pState, this.pOut);
    if (count === 0) return;
    const off = this.pOut >> 2;
    const chunk = this.wasmMem.slice(off, off + count);
    this.port.postMessage({ type: 'chunk', buffer: chunk.buffer }, [chunk.buffer]);
  }

  // ── JS fallback flush ──────────────────────────────────────────────────────

  _flushJs() {
    if (this._samples === 0) return;
    const merged = new Float32Array(this._samples);
    let o = 0;
    for (const c of this._chunks) { merged.set(c, o); o += c.length; }
    this._chunks = [];
    this._samples = 0;
    this.port.postMessage({ type: 'chunk', buffer: merged.buffer }, [merged.buffer]);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // pass-through
    if (input && output) {
      for (let ch = 0; ch < input.length && ch < output.length; ch++) {
        output[ch].set(input[ch]);
      }
    }

    if (!input || !input[0]) return true;
    const frame = input[0];

    if (this.wasm && this.pState) {
      if (this.wasmMem.buffer !== this.wasm.memory.buffer) this._refreshMemView();
      const inOff = this.pIn >> 2;
      this.wasmMem.set(frame, inOff);
      const ready = this.wasm.recorder_push(this.pState, this.pIn, frame.length);
      if (ready > 0) this._flushWasm();
    } else {
      const copy = frame.slice();
      this._chunks.push(copy);
      this._samples += copy.length;
      if (this._samples >= this._flushEvery) this._flushJs();
    }

    return true;
  }
}

registerProcessor('RecorderProcessor', RecorderProcessor);
