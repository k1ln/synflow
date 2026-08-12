import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { BrassFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualBrassNode — a lip-reed brass instrument waveguide (STK `Brass`) as an
 * AudioWorklet (see public/BrassProcessor.js). A trigger-excited audio
 * *source*: note-on gates the breath envelope, the `frequency` AudioParam sets
 * the pitch, and the continuous knobs (lip tension, slide length, breath
 * attack/release, vibrato) are pushed to the worklet via port messages. Mark a
 * flow's node `isTrigger` + `isPitch` (pitchParam: "frequency") and the
 * Instrument UI / DAW play it directly.
 *
 * Handles:
 * - main-input : the note trigger (receiveNodeOn / receiveNodeOff)
 * - frequency  : audio-rate pitch (summed into the frequency param — glide/bend)
 * - output     : audio out
 */
export class VirtualBrassNode extends VirtualNode<
  CustomNode & BrassFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input", "frequency"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private cfg: {
    frequency: number; tension: number; slide: number;
    attack: number; release: number; vibratoRate: number; vibratoGain: number;
  };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & BrassFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    this.cfg = this.readConfig(node.data || {});
    if (audioContext) {
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOn`, (data: any) => {
      const velocity = typeof data?.velocity === "number" ? data.velocity : 1;
      this.worklet?.port.postMessage({ noteOn: true, velocity });
    });
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOff`, () => {
      this.worklet?.port.postMessage({ noteOff: true });
    });
    void this.initWorklet();
  }

  private num(v: unknown, dflt: number): number { return typeof v === "number" && Number.isFinite(v) ? v : dflt; }

  private readConfig(d: any) {
    return {
      frequency: this.num(d.frequency, 220),
      tension: this.num(d.tension, 0.5),
      slide: this.num(d.slide, 0.5),
      attack: this.num(d.attack, 0.05),
      release: this.num(d.release, 0.1),
      vibratoRate: this.num(d.vibratoRate, 0.5),
      vibratoGain: this.num(d.vibratoGain, 0.0),
    };
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/BrassProcessor.js");
      const wasmModule = await compileWasmModule("/brass.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "brass-processor", {
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
      console.error("[VirtualBrassNode] Failed to init worklet:", e);
    }
  }

  /** Push the continuous knob config (tension/slide/attack/release/vibrato) to the worklet. */
  private pushConfig() {
    if (!this.worklet) return;
    this.worklet.port.postMessage({
      tension: this.cfg.tension,
      slide: this.cfg.slide,
      attack: this.cfg.attack,
      release: this.cfg.release,
      vibratoRate: this.cfg.vibratoRate,
      vibratoGain: this.cfg.vibratoGain,
    });
  }

  /** Re-read config from node data on init/factory render. */
  render(data?: Partial<BrassFlowNodeProps["data"]>) {
    if (data) this.cfg = this.readConfig({ ...this.cfg, ...data });
    if (this.workletReady) {
      const f = (this.worklet?.parameters as Map<string, AudioParam> | undefined)?.get("frequency");
      if (f) f.value = this.cfg.frequency;
      this.pushConfig();
    }
  }

  /** Continuous param changes (tension/slide/attack/release/vibrato/frequency). */
  handleUpdateParams(node: CustomNode & BrassFlowNodeProps, data: any) {
    if (data && data.data) {
      this.cfg = this.readConfig({ ...this.cfg, ...data.data });
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
      try { const param = params.get(handle); if (param) source.connect(param); } catch (e) { console.warn("[VirtualBrassNode] pending param input connect failed:", e); }
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

export default VirtualBrassNode;
