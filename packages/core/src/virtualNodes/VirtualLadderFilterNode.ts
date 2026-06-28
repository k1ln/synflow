import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { LadderFilterFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualLadderFilterNode — a Moog-style 4-pole transistor-ladder low-pass
 * implemented as an AudioWorklet (see public/LadderProcessor.js). It
 * self-oscillates near max resonance and saturates under drive, giving the
 * classic Moog/Prophet/303/MS-20 character a plain BiquadFilter can't.
 *
 * The worklet loads asynchronously, but AudioGraphManager wires edges
 * synchronously at graph build time. So we expose persistent input/output
 * GainNodes and splice the worklet between them once ready —
 * getInputNode()/getOutputNode() always return a live node.
 *
 * Handles:
 * - main-input (audio in)
 * - cutoff     (audio-rate modulation, summed into the cutoff AudioParam)
 * - resonance  (audio-rate modulation, summed into the resonance AudioParam)
 * - output     (audio out)
 *
 * Continuous controls (cutoff/resonance/drive) are AudioParams handled by the
 * base class once this.audioNode points at the worklet. The discrete `poles`
 * control (2 => 12 dB, 4 => 24 dB) is sent via port.postMessage.
 */
export class VirtualLadderFilterNode extends VirtualNode<
  CustomNode & LadderFilterFlowNodeProps,
  AudioWorkletNode | undefined
> {
  // Named audio inputs routed by AudioGraphManager via connectToInput().
  public connectHandleNames: string[] = ["main-input", "cutoff", "resonance"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  // Param-modulation inputs (cutoff/resonance) buffered until the worklet exists.
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private initial: { cutoff: number; resonance: number; drive: number; poles: number };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & LadderFilterFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    this.initial = {
      cutoff: typeof d.cutoff === "number" ? d.cutoff : 1200,
      resonance: typeof d.resonance === "number" ? d.resonance : 0.3,
      drive: typeof d.drive === "number" ? d.drive : 1,
      poles: this.normalizePoles(d.poles),
    };
    if (audioContext) {
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    void this.initWorklet();
  }

  private normalizePoles(v: unknown): number {
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return n === 2 || n === 12 ? 2 : 4;
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/LadderProcessor.js");
      const wasmModule = await compileWasmModule("/ladder.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "ladder-processor", {
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
      console.error("[VirtualLadderFilterNode] Failed to init worklet:", e);
    }
  }

  /** Initial param application from the factory (data already cached in ctor). */
  render(data?: Partial<LadderFilterFlowNodeProps["data"]>) {
    if (data) {
      if (typeof data.cutoff === "number") this.initial.cutoff = data.cutoff;
      if (typeof data.resonance === "number") this.initial.resonance = data.resonance;
      if (typeof data.drive === "number") this.initial.drive = data.drive;
      if (data.poles !== undefined) this.initial.poles = this.normalizePoles(data.poles);
    }
    if (this.workletReady) this.applyInitialToNode();
  }

  private applyInitialToNode() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    const set = (name: string, value: number) => { const p = params.get(name); if (p) p.value = value; };
    set("cutoff", this.initial.cutoff);
    set("resonance", this.initial.resonance);
    set("drive", this.initial.drive);
    this.worklet.port.postMessage({ poles: this.initial.poles });
  }

  /** Discrete control (poles) → worklet; continuous → base AudioParam path. */
  handleUpdateParams(node: CustomNode & LadderFilterFlowNodeProps, data: any) {
    if (data && data.data && "poles" in data.data) this.setPoles(data.data.poles);
    super.handleUpdateParams(node, data);
  }

  public setPoles(poles: unknown) {
    const p = this.normalizePoles(poles);
    this.initial.poles = p;
    if (this.worklet) this.worklet.port.postMessage({ poles: p });
  }

  /** Named-input routing from AudioGraphManager. */
  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "cutoff" || handleName === "resonance") {
      if (!this.workletReady || !this.worklet) {
        this.pendingParamInputs.push({ source, handle: handleName });
        return;
      }
      const param = (this.worklet.parameters as Map<string, AudioParam>).get(handleName);
      if (param) { source.connect(param); return; }
    }
    // main-input (and any unknown handle) → the persistent input node
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
        console.warn("[VirtualLadderFilterNode] pending param input connect failed:", e);
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

export default VirtualLadderFilterNode;
