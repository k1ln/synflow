import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import VirtualNode from "./VirtualNode";

type AnalyzerConfig = {
  fftSize?: number;
  minDecibels?: number;
  maxDecibels?: number;
  smoothingTimeConstant?: number;
};

class VirtualAnalyzerNodeGPT extends VirtualNode<CustomNode> {
  private analyser: AnalyserNode;
  private freq: Uint8Array;
  private wave: Uint8Array;
  private raf?: number;
  private lastEmit = 0;
  private emitMs = 33;
  private tapGain?: GainNode;

  constructor(
    ctx: AudioContext,
    bus: EventBus,
    node: CustomNode,
  ) {
    const analyser = ctx.createAnalyser();
    super(ctx, analyser, bus, node);
    this.analyser = analyser;
    this.freq = new Uint8Array(
      analyser.frequencyBinCount,
    );
    this.wave = new Uint8Array(analyser.fftSize);
    this.tapGain = ctx.createGain();
    this.audioNode = this.tapGain;
    this.tapGain.gain.value = 1;
    this.tapGain.connect(this.analyser);
    this.render(node.data as AnalyzerConfig);
    this.startLoop();
  }

  render(settings?: Partial<AnalyzerConfig>) {
    const cfg = settings || {};
    const fft = this.pickFft(cfg.fftSize);
    if (this.analyser.fftSize !== fft) {
      this.analyser.fftSize = fft;
      this.freq = new Uint8Array(
        this.analyser.frequencyBinCount,
      );
      this.wave = new Uint8Array(
        this.analyser.fftSize,
      );
    }
    if (typeof cfg.minDecibels === "number") {
      this.analyser.minDecibels = cfg.minDecibels;
    }
    if (typeof cfg.maxDecibels === "number") {
      this.analyser.maxDecibels = cfg.maxDecibels;
    }
    if (
      typeof cfg.smoothingTimeConstant === "number"
    ) {
      this.analyser.smoothingTimeConstant = Math.min(
        0.99,
        Math.max(0, cfg.smoothingTimeConstant),
      );
    }
  }


  private pickFft(nextSize?: number) {
    const size = nextSize ?? 1024;
    const clamp = Math.min(32768, Math.max(32, size));
    let pow = 32;
    while (pow < clamp) {
      pow *= 2;
    }
    return pow;
  }

  private startLoop() {
    if (typeof window === "undefined") {
      return;
    }
    const loop = () => {
        
      this.raf = window.requestAnimationFrame(loop);
      if (!this.analyser) {
        return;
      }
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.wave);
      const now = performance.now();
      if (now - this.lastEmit < this.emitMs) {
        return;
      }
      this.lastEmit = now;
     // console.log('emitting analyzer data', this.node.id, this.wave);
      this.eventBus.emit(
        `${this.node.id}.analyser.data`,
        {
          fftSize: this.analyser.fftSize,
          freq: Array.from(this.freq),
          wave: Array.from(this.wave),
          timestamp: now,
        },
      );
    };
    loop();
  }

  disconnect() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }
    if (this.tapGain) {
      this.analyser.disconnect(this.tapGain);
      this.tapGain.disconnect();
      this.tapGain = undefined;
    }
    super.disconnect();
  }
}

export default VirtualAnalyzerNodeGPT;
