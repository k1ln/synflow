import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { SvfDriveFilterFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualSvfDriveFilterNode — a zero-delay-feedback (TPT) state-variable filter
 * with pre-filter drive and a saturating resonance nonlinearity, implemented as
 * an AudioWorklet (see public/SvfDriveProcessor.js). It self-oscillates near max
 * resonance and overdrives musically, unlike the plain BiquadFilter.
 *
 * The worklet loads asynchronously, but AudioGraphManager wires edges
 * synchronously at graph build time. So we expose persistent input/output
 * GainNodes (created in the constructor) and splice the worklet between them
 * once it is ready — getInputNode()/getOutputNode() therefore always return a
 * live node, and no connection is dropped.
 *
 * Handles:
 * - main-input (audio in)
 * - cutoff     (audio-rate modulation, summed into the cutoff AudioParam)
 * - resonance  (audio-rate modulation, summed into the resonance AudioParam)
 * - output     (audio out)
 *
 * Continuous controls (cutoff/resonance/drive/mix) are AudioParams handled by the
 * base class (once this.audioNode points at the worklet). Discrete controls
 * (mode/slope) are sent via port.postMessage.
 */

const MODE_INDEX: Record<string, number> = { lp: 0, lowpass: 0, hp: 1, highpass: 1, bp: 2, bandpass: 2, notch: 3 };

export class VirtualSvfDriveFilterNode extends VirtualNode<
  CustomNode & SvfDriveFilterFlowNodeProps,
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

  private initial: { cutoff: number; resonance: number; drive: number; mix: number; mode: number; slope: number };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & SvfDriveFilterFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    this.initial = {
      cutoff: typeof d.cutoff === "number" ? d.cutoff : 1000,
      resonance: typeof d.resonance === "number" ? d.resonance : 0.2,
      drive: typeof d.drive === "number" ? d.drive : 1,
      mix: typeof d.mix === "number" ? d.mix : 1,
      mode: this.normalizeMode(d.mode),
      slope: this.normalizeSlope(d.slope),
    };
    if (audioContext) {
      // Persistent passthrough nodes so in/out are always wireable.
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    void this.initWorklet();
  }

  private normalizeMode(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.min(3, v | 0));
    if (typeof v === "string") {
      const key = v.trim().toLowerCase();
      if (key in MODE_INDEX) return MODE_INDEX[key];
      const n = parseInt(key, 10);
      if (!isNaN(n)) return Math.max(0, Math.min(3, n));
    }
    return 0;
  }

  private normalizeSlope(v: unknown): number {
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return n === 2 || n === 24 ? 2 : 1;
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/SvfDriveProcessor.js");
      const wasmModule = await compileWasmModule("/svf-drive.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "svf-drive-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      // Splice the worklet between the persistent passthrough nodes.
      this.inputGain.connect(worklet);
      worklet.connect(this.outputGain);
      // Expose the worklet to the base class for AudioParam updates.
      this.audioNode = worklet;

      this.applyInitialToNode();
      this.workletReady = true;
      this.flushPendingParamInputs();
    } catch (e) {
      console.error("[VirtualSvfDriveFilterNode] Failed to init worklet:", e);
    }
  }

  /** Initial param application from the factory (data already cached in ctor). */
  render(data?: Partial<SvfDriveFilterFlowNodeProps["data"]>) {
    if (data) {
      if (typeof data.cutoff === "number") this.initial.cutoff = data.cutoff;
      if (typeof data.resonance === "number") this.initial.resonance = data.resonance;
      if (typeof data.drive === "number") this.initial.drive = data.drive;
      if (typeof data.mix === "number") this.initial.mix = data.mix;
      if (data.mode !== undefined) this.initial.mode = this.normalizeMode(data.mode);
      if (data.slope !== undefined) this.initial.slope = this.normalizeSlope(data.slope);
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
    set("mix", this.initial.mix);
    this.worklet.port.postMessage({ mode: this.initial.mode, slope: this.initial.slope });
  }

  /** Discrete controls (mode/slope) → worklet; continuous → base AudioParam path. */
  handleUpdateParams(node: CustomNode & SvfDriveFilterFlowNodeProps, data: any) {
    if (data && data.data) {
      if ("mode" in data.data) this.setMode(data.data.mode);
      if ("slope" in data.data) this.setSlope(data.data.slope);
    }
    super.handleUpdateParams(node, data);
  }

  public setMode(mode: unknown) {
    const m = this.normalizeMode(mode);
    this.initial.mode = m;
    if (this.worklet) this.worklet.port.postMessage({ mode: m });
  }

  public setSlope(slope: unknown) {
    const s = this.normalizeSlope(slope);
    this.initial.slope = s;
    if (this.worklet) this.worklet.port.postMessage({ slope: s });
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
        console.warn("[VirtualSvfDriveFilterNode] pending param input connect failed:", e);
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

export default VirtualSvfDriveFilterNode;
