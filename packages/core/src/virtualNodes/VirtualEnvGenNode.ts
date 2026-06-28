import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { EnvGenFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualEnvGenNode — an audio-rate ADSR envelope generator (AudioWorklet, see
 * public/EnvGenProcessor.js, Rust core src/wasm/envgen). Unlike the
 * scheduler-based ADSR node, it outputs an actual envelope *signal*
 * (bias + amount*ADSR), so its output can be patched into ANY param handle —
 * including the worklet ladder/SVF cutoff that the scheduler can't drive.
 *
 * Handles:
 * - main-input : the note trigger (receiveNodeOn / receiveNodeOff)
 * - output     : the envelope signal (connect to a cutoff/pitch/gain param)
 *
 * attack/decay/sustain/release/amount/bias are AudioParams handled by the base
 * class (so knob changes flow through params.updateParams automatically).
 */
export class VirtualEnvGenNode extends VirtualNode<
  CustomNode & EnvGenFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input"];

  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;

  private initial: { attack: number; decay: number; sustain: number; release: number; amount: number; bias: number };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & EnvGenFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
    this.initial = {
      attack: num(d.attack, 0.01),
      decay: num(d.decay, 0.2),
      sustain: num(d.sustain, 0.5),
      release: num(d.release, 0.3),
      amount: num(d.amount, 1),
      bias: num(d.bias, 0),
    };
    if (audioContext) this.outputGain = audioContext.createGain();
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOn`, () => this.worklet?.port.postMessage({ gateOn: true }));
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOff`, () => this.worklet?.port.postMessage({ gateOff: true }));
    void this.initWorklet();
  }

  private async initWorklet() {
    if (!this.audioContext || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/EnvGenProcessor.js");
      const wasmModule = await compileWasmModule("/envgen.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "envgen-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      worklet.connect(this.outputGain);
      this.audioNode = worklet; // base class drives the a/d/s/r/amount/bias AudioParams
      this.applyInitialToNode();
      this.workletReady = true;
    } catch (e) {
      console.error("[VirtualEnvGenNode] Failed to init worklet:", e);
    }
  }

  render(data?: Partial<EnvGenFlowNodeProps["data"]>) {
    if (data) {
      const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
      this.initial = {
        attack: num((data as any).attack, this.initial.attack),
        decay: num((data as any).decay, this.initial.decay),
        sustain: num((data as any).sustain, this.initial.sustain),
        release: num((data as any).release, this.initial.release),
        amount: num((data as any).amount, this.initial.amount),
        bias: num((data as any).bias, this.initial.bias),
      };
    }
    if (this.workletReady) this.applyInitialToNode();
  }

  private applyInitialToNode() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    const set = (name: string, value: number) => { const p = params.get(name); if (p) p.value = value; };
    set("attack", this.initial.attack);
    set("decay", this.initial.decay);
    set("sustain", this.initial.sustain);
    set("release", this.initial.release);
    set("amount", this.initial.amount);
    set("bias", this.initial.bias);
  }

  // No audio inputs — the trigger arrives as an event, not an audio connection.
  public connectToInput(_source: AudioNode, _handleName: string): void { /* noop */ }

  connect(destination: AudioNode | AudioParam) {
    if (this.outputGain) this.outputGain.connect(destination as any);
  }

  disconnect() {
    try { this.outputGain?.disconnect(); } catch { /* noop */ }
    try { this.worklet?.disconnect(); } catch { /* noop */ }
  }

  public getOutputNode(): AudioNode | undefined { return this.outputGain; }
}

export default VirtualEnvGenNode;
