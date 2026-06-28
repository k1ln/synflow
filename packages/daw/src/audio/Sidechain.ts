// Sidechain ducker: an envelope follower on a KEY signal that produces a negative
// control signal used to duck a TARGET track's gain (the classic kick-ducks-bass
// pump). Web Audio's DynamicsCompressorNode has no external key input, so we build
// the follower from native nodes:
//
//   key ─► rectify |x| ─► lowpass (smooth → envelope) ─► pre-gain ─► clamp [0,1] ─► ×(−amount) ─► output
//
// `output` is wired to the target gain's AudioParam: gain = 1 + output = 1 − amount·env,
// so a loud key pulls the target down toward (1 − amount).

function curveFrom(fn: (x: number) => number, n = 1024) {
  // Back with an explicit ArrayBuffer so the type narrows to Float32Array<ArrayBuffer>,
  // which is what WaveShaperNode.curve expects under current lib.dom typings.
  const c = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
const ABS_CURVE = curveFrom(Math.abs);                               // full-wave rectify
const CLAMP_CURVE = curveFrom((x) => Math.min(Math.max(x, 0), 1));   // keep env in [0,1]

/** Map a release time (ms) to the smoothing lowpass cutoff (Hz). Longer release =
 *  lower cutoff = slower envelope decay. */
const releaseToHz = (ms: number): number => Math.max(0.2, Math.min(40, 1000 / (2 * Math.PI * Math.max(10, ms))));

export class SidechainProcessor {
  /** Connect the key (trigger) signal into this. */
  readonly input: GainNode;
  /** Connect this to the target gain's AudioParam (carries −amount·env). */
  readonly output: GainNode;
  private rectify: WaveShaperNode;
  private smooth: BiquadFilterNode;
  private pre: GainNode;
  private clamp: WaveShaperNode;

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.rectify = ctx.createWaveShaper(); this.rectify.curve = ABS_CURVE;
    this.smooth = ctx.createBiquadFilter(); this.smooth.type = 'lowpass'; this.smooth.Q.value = 0.707; this.smooth.frequency.value = releaseToHz(200);
    this.pre = ctx.createGain(); this.pre.gain.value = 5;          // sensitivity: push typical hits toward full depth
    this.clamp = ctx.createWaveShaper(); this.clamp.curve = CLAMP_CURVE;
    this.output = ctx.createGain(); this.output.gain.value = -0.6; // −amount

    this.input.connect(this.rectify);
    this.rectify.connect(this.smooth);
    this.smooth.connect(this.pre);
    this.pre.connect(this.clamp);
    this.clamp.connect(this.output);
  }

  setAmount(a: number): void { this.output.gain.value = -Math.max(0, Math.min(1, a)); }
  setRelease(ms: number): void { this.smooth.frequency.value = releaseToHz(ms); }

  dispose(): void {
    for (const n of [this.input, this.rectify, this.smooth, this.pre, this.clamp, this.output]) {
      try { n.disconnect(); } catch { /* noop */ }
    }
  }
}
