import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { KarplusFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualKarplusNode — a Karplus–Strong plucked-string physical model
 * (AudioWorklet, see public/KarplusProcessor.js). It is a trigger-excited audio
 * *source*: a note-on injects a noise burst into a feedback delay line that
 * rings at the note pitch. Mark a flow's node `isTrigger` + `isPitch`
 * (pitchParam: "frequency") and the Instrument UI / DAW play it directly.
 *
 * The worklet loads asynchronously while AudioGraphManager wires edges
 * synchronously, so we expose persistent input/output GainNodes and splice the
 * worklet between them once ready (same approach as the filter worklets).
 *
 * Handles:
 * - main-input : the note trigger (receiveNodeOn) AND an optional audio exciter
 * - frequency  : audio-rate pitch modulation (summed into the frequency param)
 * - output     : audio out
 *
 * Continuous controls (frequency/decay/tone) are AudioParams handled by the base
 * class once this.audioNode points at the worklet.
 */
export class VirtualKarplusNode extends VirtualNode<
  CustomNode & KarplusFlowNodeProps,
  AudioWorkletNode | undefined
> {
  // Named audio inputs routed by AudioGraphManager via connectToInput().
  public connectHandleNames: string[] = ["main-input", "frequency"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private initial: { frequency: number; decay: number; tone: number };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & KarplusFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    this.initial = {
      frequency: typeof d.frequency === "number" ? d.frequency : 220,
      decay: typeof d.decay === "number" ? d.decay : 0.6,
      tone: typeof d.tone === "number" ? d.tone : 0.6,
    };
    if (audioContext) {
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    // A note-on (from MIDI, a Button, the Instrument UI, or the DAW) plucks the
    // string. Note-off is ignored — the string rings out naturally.
    this.eventBus.subscribe(`${node.id}.main-input.receiveNodeOn`, (data: any) => {
      const velocity = typeof data?.velocity === "number" ? data.velocity : 1;
      this.pluck(velocity);
    });
    void this.initWorklet();
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/KarplusProcessor.js");
      const wasmModule = await compileWasmModule("/karplus.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "karplus-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      this.inputGain.connect(worklet);
      worklet.connect(this.outputGain);
      this.audioNode = worklet; // base class drives AudioParams from here

      this.applyInitialToNode();
      this.workletReady = true;
      this.flushPendingParamInputs();
    } catch (e) {
      console.error("[VirtualKarplusNode] Failed to init worklet:", e);
    }
  }

  /** Initial param application from the factory (data already cached in ctor). */
  render(data?: Partial<KarplusFlowNodeProps["data"]>) {
    if (data) {
      if (typeof data.frequency === "number") this.initial.frequency = data.frequency;
      if (typeof data.decay === "number") this.initial.decay = data.decay;
      if (typeof data.tone === "number") this.initial.tone = data.tone;
    }
    if (this.workletReady) this.applyInitialToNode();
  }

  private applyInitialToNode() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    const set = (name: string, value: number) => { const p = params.get(name); if (p) p.value = value; };
    set("frequency", this.initial.frequency);
    set("decay", this.initial.decay);
    set("tone", this.initial.tone);
  }

  /** Trigger a pluck (called from the note-on subscription). */
  public pluck(velocity = 1) {
    if (this.worklet) this.worklet.port.postMessage({ pluck: true, velocity });
  }

  /** Named-input routing from AudioGraphManager. */
  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "frequency") {
      if (!this.workletReady || !this.worklet) {
        this.pendingParamInputs.push({ source, handle: handleName });
        return;
      }
      const param = (this.worklet.parameters as Map<string, AudioParam>).get("frequency");
      if (param) { source.connect(param); return; }
    }
    // main-input (audio exciter) and any unknown handle → the persistent input node
    if (this.inputGain) source.connect(this.inputGain);
  }

  private flushPendingParamInputs() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    this.pendingParamInputs.forEach(({ source, handle }) => {
      try {
        const param = params.get(handle);
        if (param) source.connect(param);
      } catch (e) {
        console.warn("[VirtualKarplusNode] pending param input connect failed:", e);
      }
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

  public getOutputNode(): AudioNode | undefined {
    return this.outputGain;
  }

  public getInputNode(): AudioNode | undefined {
    return this.inputGain;
  }
}

export default VirtualKarplusNode;
