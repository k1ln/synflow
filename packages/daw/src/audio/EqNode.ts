// Native parametric EQ as a Web Audio subgraph: input → [BiquadFilter per band] →
// output, with an AnalyserNode tapping the output to drive the editor's live
// spectrum. Used as an FX insert at any level (see Mixer.FxChain).
import type { EqBand, EqSettings } from '../model/project';

const dbToGain = (db: number) => 10 ** (db / 20);

export class EqNode {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly analyser: AnalyserNode;
  private filters: BiquadFilterNode[] = [];
  private ids: string[] = [];
  private types: BiquadFilterType[] = [];

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.8;
    this.output.connect(this.analyser); // sidechain (analyser has no output → no signal effect)
    this.input.connect(this.output);    // passthrough until bands exist
  }

  /** Apply settings. Updates band params in place when the band shape is unchanged
   *  (smooth drags); rebuilds the chain on add/remove/type change. */
  setSettings(s: EqSettings): void {
    this.output.gain.value = s.on ? dbToGain(s.outDb) : 1;
    const active = s.on ? s.bands.filter((b) => b.on) : [];
    const sameShape = active.length === this.filters.length && active.every((b, i) => this.ids[i] === b.id && this.types[i] === b.type);
    if (sameShape) {
      const t = this.ctx.currentTime;
      active.forEach((b, i) => {
        const f = this.filters[i];
        f.frequency.setTargetAtTime(b.freq, t, 0.008);
        f.Q.setTargetAtTime(b.q, t, 0.008);
        f.gain.setTargetAtTime(b.gain, t, 0.008);
      });
    } else {
      this.rebuild(active);
    }
  }

  private rebuild(bands: EqBand[]): void {
    try { this.input.disconnect(); } catch { /* noop */ }
    for (const f of this.filters) { try { f.disconnect(); } catch { /* noop */ } }
    this.filters = bands.map((b) => {
      const f = this.ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
      return f;
    });
    this.ids = bands.map((b) => b.id);
    this.types = bands.map((b) => b.type);
    let node: AudioNode = this.input;
    for (const f of this.filters) { node.connect(f); node = f; }
    node.connect(this.output);
  }

  dispose(): void {
    try { this.input.disconnect(); } catch { /* noop */ }
    for (const f of this.filters) { try { f.disconnect(); } catch { /* noop */ } }
    try { this.output.disconnect(); } catch { /* noop */ }
    try { this.analyser.disconnect(); } catch { /* noop */ }
    this.filters = [];
  }
}
