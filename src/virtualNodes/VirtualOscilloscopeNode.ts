import { a } from "vitest/dist/chunks/suite.d.BJWk38HB";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import VirtualNode from "./VirtualNode";

type OscilloscopeConfig = {
  fftSize?: number;
  smoothingTimeConstant?: number;
};

class VirtualOscilloscopeNode extends VirtualNode<CustomNode> {
  private analyser: AnalyserNode;
  private wave: Uint8Array;
  private raf?: number;
  private lastEmit = 0;
  private emitMs = 16; // ~60fps for smoother waveform
  private tapGain?: GainNode;
  private analyserConnected: boolean = false;

  constructor(
    ctx: AudioContext,
    bus: EventBus,
    node: CustomNode,
  ) {
    const analyser = ctx.createAnalyser();
    super(ctx, analyser, bus, node);
    this.init(ctx, bus, node,analyser);
  }

  init(ctx: AudioContext, bus: EventBus, node: CustomNode,analyser: AnalyserNode) {
    this.analyser = analyser;
    this.wave = new Uint8Array(analyser.fftSize);
    this.tapGain = ctx.createGain();
    this.audioNode = this.tapGain;
    this.tapGain.gain.value = 1;
    this.tapGain.connect(this.analyser);
    this.render(node.data as OscilloscopeConfig);
    this.startLoop();
  }

  render(settings?: Partial<OscilloscopeConfig>) {
    const cfg = settings || {};
    const fft = this.pickFft(cfg.fftSize);
    if (this.analyser.fftSize !== fft) {
      this.analyser.fftSize = fft;
      this.wave = new Uint8Array(this.analyser.fftSize);
    }
    // Set appropriate range for waveform visualization
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;
    if (typeof cfg.smoothingTimeConstant === "number") {
      this.analyser.smoothingTimeConstant = Math.min(
        0.99,
        Math.max(0, cfg.smoothingTimeConstant),
      );
    } else {
      this.analyser.smoothingTimeConstant = 0;
    }
  }

  private pickFft(nextSize?: number) {
    const size = nextSize ?? 2048;
    const clamp = Math.min(32768, Math.max(512, size));
    let pow = 512;
    while (pow < clamp) {
      pow *= 2;
    }
    return pow;
  }

  private startLoop() {
    // Ensure tapGain exists and is connected to analyser.
    // Recreate missing tapGain so the analyser receives input after reconnection.
    if (!this.tapGain) {
      try {
        const ctx = this.audioContext as AudioContext;
        if (ctx) {
          this.tapGain = ctx.createGain();
          this.audioNode = this.tapGain;
          this.tapGain.gain.value = 1;
        }
      } catch (e) {
        // ignore
      }
    }
    if (this.tapGain && this.analyser && !this.analyserConnected) {
      try {
        this.tapGain.connect(this.analyser);
        this.analyserConnected = true;
      } catch (e) {
        // Ignore errors here; connection may already exist or audio context issues
      }
    }
    if (typeof window === "undefined") {
      return;
    }
    if (this.raf) {
      window.cancelAnimationFrame(this.raf);
    }
    const loop = () => {
      this.raf = window.requestAnimationFrame(loop);
      if (!this.analyser) {
        return;
      }
      this.analyser.getByteTimeDomainData(this.wave);
      const now = performance.now();
      if (now - this.lastEmit < this.emitMs) {
        return;
      }
      this.lastEmit = now;
      this.eventBus.emit(
        `${this.node.id}.GUI.analyser.data`,
        {
          fftSize: this.analyser.fftSize,
          wave: Array.from(this.wave),
          timestamp: now,
        },
      );
    };
    loop();
  }

  /** Ensure the visualizer loop is running (safe to call repeatedly). */
  public ensureLoop() {
    try {
      this.startLoop();
    } catch (e) {
      // Swallow errors to avoid breaking audio graph operations
      console.warn('[VirtualOscilloscopeNode] ensureLoop failed', e);
    }
  }

  disconnect() {
    // Keep the RAF running for the visualizer even if audio connections change.
    // Cancelling the RAF here causes the UI rendering to stop when other
    // parts of the graph temporarily disconnect/reconnect this node.
    if (this.tapGain && this.analyser && this.analyserConnected) {
      try {
        // Only disconnect the analyser input — keep `tapGain` itself intact so
        // any sources connected to it are preserved across graph rewirings.
        this.tapGain.disconnect(this.analyser as any);
      } catch (e) {
        // If targeted disconnect fails, attempt a safe full disconnect of analyser
        try { this.analyser.disconnect(); } catch (e) { /* noop */ }
      }
      this.analyserConnected = false;
    }
    try { this.analyser.disconnect(); } catch (e) { /* noop */ }
    // Do NOT call super.disconnect() here — that would disconnect `tapGain`
    // from its upstream sources and lose the connections we want to preserve.
  }

  /** Fully dispose the visualizer and release audio resources. */
  dispose() {
    // Stop RAF
    if (this.raf) {
      try { window.cancelAnimationFrame(this.raf); } catch (e) { /* noop */ }
      this.raf = undefined;
    }
    // Disconnect analyser and tapGain completely
    try { this.analyser.disconnect(); } catch (e) { /* noop */ }
    if (this.tapGain) {
      try { this.tapGain.disconnect(); } catch (e) { /* noop */ }
      this.tapGain = undefined;
    }
    this.analyserConnected = false;
    // Unsubscribe any event listeners for this node
    try { this.eventBus.unsubscribeAllByNodeId(this.node.id); } catch (e) { /* noop */ }
    // Finally disconnect any remaining audio connections via base class
    try { super.disconnect(); } catch (e) { /* noop */ }
    this.audioNode = undefined as any;
  }
}

export default VirtualOscilloscopeNode;
