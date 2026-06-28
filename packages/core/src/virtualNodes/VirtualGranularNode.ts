import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { GranularFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualGranularNode — a live granular "cloud" effect (AudioWorklet, see
 * public/GranularProcessor.js). It records its audio input into a ring buffer
 * and sprays overlapping windowed grains from it. Feed it any source for
 * clouds/textures/freezes. An audio transformer (in → out), like the filters.
 *
 * Handles:
 * - main-input : audio in (recorded into the grain buffer)
 * - position   : audio-rate scan of the buffer history (an LFO here = motion)
 * - pitch      : audio-rate grain transpose
 * - size       : audio-rate grain size
 * - output     : the granular cloud (dry/wet via `mix`)
 *
 * Continuous controls (density/size/position/spray/pitch/mix) are AudioParams.
 * The discrete `freeze` (hold the buffer) is sent via port.postMessage.
 */
export class VirtualGranularNode extends VirtualNode<
  CustomNode & GranularFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input", "position", "pitch", "size"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private initial: { density: number; size: number; position: number; spray: number; pitch: number; mix: number; freeze: boolean };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & GranularFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    const d = node.data || {};
    const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
    this.initial = {
      density: num(d.density, 30),
      size: num(d.size, 120),
      position: num(d.position, 0.1),
      spray: num(d.spray, 0.2),
      pitch: num(d.pitch, 1),
      mix: num(d.mix, 1),
      freeze: !!d.freeze,
    };
    if (audioContext) {
      this.inputGain = audioContext.createGain();
      this.outputGain = audioContext.createGain();
    }
    void this.initWorklet();
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/GranularProcessor.js");
      const wasmModule = await compileWasmModule("/granular.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "granular-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      this.inputGain.connect(worklet);
      worklet.connect(this.outputGain);
      this.audioNode = worklet;

      this.applyInitialToNode();
      this.workletReady = true;
      this.flushPendingParamInputs();
    } catch (e) {
      console.error("[VirtualGranularNode] Failed to init worklet:", e);
    }
  }

  render(data?: Partial<GranularFlowNodeProps["data"]>) {
    if (data) {
      const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
      if (typeof data.density === "number") this.initial.density = data.density;
      if (typeof data.size === "number") this.initial.size = data.size;
      if (typeof data.position === "number") this.initial.position = data.position;
      if (typeof data.spray === "number") this.initial.spray = data.spray;
      if (typeof data.pitch === "number") this.initial.pitch = data.pitch;
      if (typeof data.mix === "number") this.initial.mix = num(data.mix, 1);
      if (data.freeze !== undefined) this.initial.freeze = !!data.freeze;
    }
    if (this.workletReady) this.applyInitialToNode();
  }

  private applyInitialToNode() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    const set = (name: string, value: number) => { const p = params.get(name); if (p) p.value = value; };
    set("density", this.initial.density);
    set("size", this.initial.size);
    set("position", this.initial.position);
    set("spray", this.initial.spray);
    set("pitch", this.initial.pitch);
    set("mix", this.initial.mix);
    this.worklet.port.postMessage({ freeze: this.initial.freeze });
  }

  handleUpdateParams(node: CustomNode & GranularFlowNodeProps, data: any) {
    if (data && data.data && "freeze" in data.data) this.setFreeze(data.data.freeze);
    super.handleUpdateParams(node, data);
  }

  public setFreeze(freeze: unknown) {
    const f = !!freeze && freeze !== "false" && freeze !== 0;
    this.initial.freeze = f;
    if (this.worklet) this.worklet.port.postMessage({ freeze: f });
  }

  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "position" || handleName === "pitch" || handleName === "size") {
      if (!this.workletReady || !this.worklet) { this.pendingParamInputs.push({ source, handle: handleName }); return; }
      const param = (this.worklet.parameters as Map<string, AudioParam>).get(handleName);
      if (param) { source.connect(param); return; }
    }
    if (this.inputGain) source.connect(this.inputGain);
  }

  private flushPendingParamInputs() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    this.pendingParamInputs.forEach(({ source, handle }) => {
      try { const param = params.get(handle); if (param) source.connect(param); } catch (e) { console.warn("[VirtualGranularNode] pending param input connect failed:", e); }
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

export default VirtualGranularNode;
