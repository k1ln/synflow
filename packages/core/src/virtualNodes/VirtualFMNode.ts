import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { FMFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualFMNode — a 6-operator FM (phase-modulation) voice as an AudioWorklet
 * (see public/FMProcessor.js). A trigger-excited audio *source*: note-on gates
 * the amp envelope, the `frequency` AudioParam sets the pitch, and the operator
 * config (ratios, levels, feedback, algorithm, envelope) is pushed to the
 * worklet via port messages. Mark a flow's node `isTrigger` + `isPitch`
 * (pitchParam: "frequency") and the Instrument UI / DAW play it directly.
 *
 * Handles:
 * - main-input : the note trigger (receiveNodeOn / receiveNodeOff)
 * - frequency  : audio-rate pitch (summed into the frequency param — glide/bend)
 * - output     : audio out (sum of the algorithm's carrier operators)
 */
export class VirtualFMNode extends VirtualNode<
  CustomNode & FMFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input", "frequency"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private cfg: {
    frequency: number; ratios: number[]; levels: number[]; feedback: number; algorithm: number;
    a: number; d: number; s: number; r: number;
  };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & FMFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    this.cfg = this.readConfig(node.data || {});
    if (audioContext) {
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOn`, (data: any) => {
      const velocity = typeof data?.velocity === "number" ? data.velocity : 1;
      this.worklet?.port.postMessage({ gateOn: true, velocity });
    });
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOff`, () => {
      this.worklet?.port.postMessage({ gateOff: true });
    });
    void this.initWorklet();
  }

  private num(v: unknown, dflt: number): number { return typeof v === "number" && Number.isFinite(v) ? v : dflt; }

  private readConfig(d: any) {
    const ratios: number[] = [];
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      ratios[i] = this.num(d[`ratio${i}`], i === 0 ? 1 : (i === 1 ? 1 : 1));
      levels[i] = this.num(d[`level${i}`], i === 0 ? 1 : 0);
    }
    return {
      frequency: this.num(d.frequency, 220),
      ratios, levels,
      feedback: this.num(d.feedback, 0),
      algorithm: this.num(d.algorithm, 1),
      a: this.num(d.attack, 0.005),
      d: this.num(d.decay, 0.3),
      s: this.num(d.sustain, 0.7),
      r: this.num(d.release, 0.3),
    };
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/FMProcessor.js");
      const wasmModule = await compileWasmModule("/fm.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "fm-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      this.inputGain.connect(worklet);
      worklet.connect(this.outputGain);
      this.audioNode = worklet; // base class drives the `frequency` AudioParam

      const f = (worklet.parameters as Map<string, AudioParam>).get("frequency");
      if (f) f.value = this.cfg.frequency;
      this.pushConfig();
      this.workletReady = true;
      this.flushPendingParamInputs();
    } catch (e) {
      console.error("[VirtualFMNode] Failed to init worklet:", e);
    }
  }

  /** Push the full operator config (ratios/levels/feedback/algorithm/envelope) to the worklet. */
  private pushConfig() {
    if (!this.worklet) return;
    this.worklet.port.postMessage({
      ratios: this.cfg.ratios,
      levels: this.cfg.levels,
      feedback: this.cfg.feedback,
      algorithm: this.cfg.algorithm,
      env: { a: this.cfg.a, d: this.cfg.d, s: this.cfg.s, r: this.cfg.r },
    });
  }

  /** Re-read config from node data on init/factory render. */
  render(data?: Partial<FMFlowNodeProps["data"]>) {
    if (data) this.cfg = this.readConfig({ ...this.cfg, ...this.flatten(), ...data });
    if (this.workletReady) {
      const f = (this.worklet?.parameters as Map<string, AudioParam> | undefined)?.get("frequency");
      if (f) f.value = this.cfg.frequency;
      this.pushConfig();
    }
  }

  // Re-expand cfg into a flat data-like object so render()'s merge sees current values.
  private flatten(): Record<string, number> {
    const o: Record<string, number> = { frequency: this.cfg.frequency, feedback: this.cfg.feedback, algorithm: this.cfg.algorithm, attack: this.cfg.a, decay: this.cfg.d, sustain: this.cfg.s, release: this.cfg.r };
    for (let i = 0; i < 6; i++) { o[`ratio${i}`] = this.cfg.ratios[i]; o[`level${i}`] = this.cfg.levels[i]; }
    return o;
  }

  /** Continuous param changes (ratios/levels/feedback/algorithm/env/frequency). */
  handleUpdateParams(node: CustomNode & FMFlowNodeProps, data: any) {
    if (data && data.data) {
      this.cfg = this.readConfig({ ...this.flatten(), ...data.data });
      this.pushConfig();
    }
    super.handleUpdateParams(node, data); // also moves the `frequency` AudioParam
  }

  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "frequency") {
      if (!this.workletReady || !this.worklet) { this.pendingParamInputs.push({ source, handle: handleName }); return; }
      const param = (this.worklet.parameters as Map<string, AudioParam>).get("frequency");
      if (param) { source.connect(param); return; }
    }
    if (this.inputGain) source.connect(this.inputGain);
  }

  private flushPendingParamInputs() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    this.pendingParamInputs.forEach(({ source, handle }) => {
      try { const param = params.get(handle); if (param) source.connect(param); } catch (e) { console.warn("[VirtualFMNode] pending param input connect failed:", e); }
    });
    this.pendingParamInputs = [];
  }

  connect(destination: AudioNode | AudioParam) {
    if (this.outputGain) this.outputGain.connect(destination as AudioNode);
  }

  disconnect() {
    try { this.outputGain?.disconnect(); } catch { /* noop */ }
    try { this.worklet?.disconnect(); } catch { /* noop */ }
    try { this.inputGain?.disconnect(); } catch { /* noop */ }
  }

  public getOutputNode(): AudioNode | undefined { return this.outputGain; }
  public getInputNode(): AudioNode | undefined { return this.inputGain; }
}

export default VirtualFMNode;
