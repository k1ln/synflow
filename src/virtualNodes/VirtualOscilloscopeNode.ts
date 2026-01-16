import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import VirtualNode from "./VirtualNode";

type OscilloscopeConfig = {
  fftSize?: number;
  smoothingTimeConstant?: number;
};

class VirtualOscilloscopeNode extends VirtualNode<CustomNode> {
  private analyser: AnalyserNode;
  private wave: Uint8Array<ArrayBuffer>;
  private raf?: number;
  private lastEmit = 0;
  private emitMs = 16; // ~60fps for smoother waveform
  private tapGain?: GainNode;

  constructor(
    ctx: AudioContext,
    bus: EventBus,
    node: CustomNode,
  ) {
    const analyser = ctx.createAnalyser();
    super(ctx, analyser, bus, node);
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
    if (typeof window === "undefined") {
      return;
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
        `${this.node.id}.analyser.data`,
        {
          fftSize: this.analyser.fftSize,
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

export default VirtualOscilloscopeNode;
