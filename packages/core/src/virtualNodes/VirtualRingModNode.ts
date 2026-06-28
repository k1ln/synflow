import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { RingModFlowNodeProps } from "../nodeData";

/**
 * VirtualRingModNode — four-quadrant ring modulator (out = a * b) implemented as
 * an AudioWorklet (public/RingModProcessor.js). Cheap and high-value for
 * metallic / clangorous tones.
 *
 * Like the SVF node, the worklet loads asynchronously while edges are wired
 * synchronously, so we expose persistent passthrough GainNodes for each input
 * and the output, and splice the worklet between them once it is ready.
 *
 * Handles:
 * - a / main-input (audio in, carrier)
 * - b             (audio in, modulator)
 * - output        (audio out = a * b)
 */
export class VirtualRingModNode extends VirtualNode<
  CustomNode & RingModFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input", "a", "b"];

  private inputA?: GainNode;
  private inputB?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & RingModFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    if (audioContext) {
      this.inputA = audioContext.createGain();
      this.inputB = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    void this.initWorklet();
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputA || !this.inputB || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/RingModProcessor.js");
      const worklet = new AudioWorkletNode(this.audioContext, "ring-mod-processor", {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.worklet = worklet;
      // input A -> worklet input 0, input B -> worklet input 1
      this.inputA.connect(worklet, 0, 0);
      this.inputB.connect(worklet, 0, 1);
      worklet.connect(this.outputGain);
      this.audioNode = worklet;
      this.workletReady = true;
    } catch (e) {
      console.error("[VirtualRingModNode] Failed to init worklet:", e);
    }
  }

  render() {
    // No continuous params; nothing to do.
  }

  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "b") {
      if (this.inputB) source.connect(this.inputB);
    } else {
      // "a" / "main-input" / unknown -> carrier
      if (this.inputA) source.connect(this.inputA);
    }
  }

  connect(destination: AudioNode | AudioParam) {
    if (this.outputGain) this.outputGain.connect(destination as AudioNode);
  }

  disconnect() {
    try { this.outputGain?.disconnect(); } catch { /* noop */ }
    try { this.worklet?.disconnect(); } catch { /* noop */ }
    try { this.inputA?.disconnect(); } catch { /* noop */ }
    try { this.inputB?.disconnect(); } catch { /* noop */ }
  }

  public getOutputNode(): AudioNode | undefined {
    return this.outputGain;
  }

  public getInputNode(): AudioNode | undefined {
    return this.inputA;
  }
}

export default VirtualRingModNode;
