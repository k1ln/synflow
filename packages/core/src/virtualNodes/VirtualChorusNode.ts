import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { ChorusFlowNodeProps } from "../nodeData";

/**
 * VirtualChorusNode — an LFO-modulated delay "ensemble" effect built from native
 * Web Audio nodes (no worklet needed). Two voices with slightly detuned LFOs
 * give a richer, wider chorus.
 *
 *   input ─┬─► dry ───────────────────────────┐
 *          ├─► delay1 (LFO1) ─► wet ───────────┤─► output
 *          └─► delay2 (LFO2) ─► wet ───────────┘
 *
 * Controls: rate (Hz), depth (ms), mix (0..1).
 * Handles: main-input (audio in), output (audio out).
 */

const RATE_MIN = 0.05, RATE_MAX = 8;
const DEPTH_MIN_MS = 0, DEPTH_MAX_MS = 8;
const BASE1 = 0.012, BASE2 = 0.008; // base delays (s)
const RATE2_RATIO = 1.13;           // detune voice 2 so the pair drifts

export class VirtualChorusNode extends VirtualNode<CustomNode & ChorusFlowNodeProps, GainNode | undefined> {
  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private dryGain?: GainNode;
  private wetGain?: GainNode;
  private delay1?: DelayNode;
  private delay2?: DelayNode;
  private lfo1?: OscillatorNode;
  private lfo2?: OscillatorNode;
  private depth1?: GainNode;
  private depth2?: GainNode;

  private rate: number;
  private depthMs: number;
  private mix: number;

  constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & ChorusFlowNodeProps) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    this.rate = this.clampRate(typeof d.rate === "number" ? d.rate : 0.8);
    this.depthMs = this.clampDepth(typeof d.depth === "number" ? d.depth : 2.5);
    this.mix = this.clampMix(typeof d.mix === "number" ? d.mix : 0.5);
    if (audioContext) this.build(audioContext);
  }

  private clampRate(v: number) { return Math.min(RATE_MAX, Math.max(RATE_MIN, v)); }
  private clampDepth(v: number) { return Math.min(DEPTH_MAX_MS, Math.max(DEPTH_MIN_MS, v)); }
  private clampMix(v: number) { return Math.min(1, Math.max(0, v)); }

  private build(ctx: AudioContext) {
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.delay1 = ctx.createDelay(1);
    this.delay2 = ctx.createDelay(1);
    this.lfo1 = ctx.createOscillator();
    this.lfo2 = ctx.createOscillator();
    this.depth1 = ctx.createGain();
    this.depth2 = ctx.createGain();

    this.lfo1.type = "sine";
    this.lfo2.type = "triangle";

    // dry path
    this.inputGain.connect(this.dryGain);
    this.dryGain.connect(this.outputGain);

    // wet paths
    this.inputGain.connect(this.delay1);
    this.inputGain.connect(this.delay2);
    this.delay1.connect(this.wetGain);
    this.delay2.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);

    // modulation
    this.delay1.delayTime.value = BASE1;
    this.delay2.delayTime.value = BASE2;
    this.lfo1.connect(this.depth1);
    this.lfo2.connect(this.depth2);
    this.depth1.connect(this.delay1.delayTime);
    this.depth2.connect(this.delay2.delayTime);

    this.applyParams();

    try { this.lfo1.start(); } catch { /* already started */ }
    try { this.lfo2.start(); } catch { /* already started */ }
  }

  private applyParams() {
    if (this.lfo1) this.lfo1.frequency.value = this.rate;
    if (this.lfo2) this.lfo2.frequency.value = this.rate * RATE2_RATIO;
    const depthSec = this.depthMs / 1000;
    if (this.depth1) this.depth1.gain.value = depthSec;
    if (this.depth2) this.depth2.gain.value = depthSec;
    if (this.wetGain) this.wetGain.gain.value = this.mix;
    if (this.dryGain) this.dryGain.gain.value = 1 - this.mix;
  }

  render(data?: Partial<ChorusFlowNodeProps["data"]>) {
    if (data) {
      if (typeof data.rate === "number") this.rate = this.clampRate(data.rate);
      if (typeof data.depth === "number") this.depthMs = this.clampDepth(data.depth);
      if (typeof data.mix === "number") this.mix = this.clampMix(data.mix);
    }
    this.applyParams();
  }

  handleUpdateParams(_node: CustomNode & ChorusFlowNodeProps, payload: any) {
    if (!payload || !payload.data) return;
    const d = payload.data;
    if (d.rate !== undefined) { const v = parseFloat(d.rate); if (!isNaN(v)) this.rate = this.clampRate(v); }
    if (d.depth !== undefined) { const v = parseFloat(d.depth); if (!isNaN(v)) this.depthMs = this.clampDepth(v); }
    if (d.mix !== undefined) { const v = parseFloat(d.mix); if (!isNaN(v)) this.mix = this.clampMix(v); }
    this.applyParams();
  }

  connect(destination: AudioNode | AudioParam) {
    if (this.outputGain) this.outputGain.connect(destination as AudioNode);
  }

  disconnect() {
    try { this.outputGain?.disconnect(); } catch { /* noop */ }
  }

  public getOutputNode(): AudioNode | undefined { return this.outputGain; }
  public getInputNode(): AudioNode | undefined { return this.inputGain; }
}

export default VirtualChorusNode;
