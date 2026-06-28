import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";
import { WavetableFlowNodeProps } from "../nodeData";
import { compileWasmModule } from "../wasmUtils";

/**
 * VirtualWavetableNode — a wavetable oscillator with a phase-distortion (Casio
 * CZ) mode, unison, and a gated amp envelope (AudioWorklet, see
 * public/WavetableProcessor.js). A trigger-excited audio *source*: note-on gates
 * the envelope, `frequency` sets pitch, `position` morphs the wavetable and
 * `warp` bends the phase index. Mark a flow's node `isTrigger` + `isPitch`
 * (pitchParam: "frequency") to play it from MIDI / the Instrument UI / the DAW.
 *
 * Handles:
 * - main-input : the note trigger (receiveNodeOn / receiveNodeOff)
 * - frequency  : audio-rate pitch (glide/bend)
 * - position   : audio-rate wavetable scan (an LFO/env here = the classic sweep)
 * - warp       : audio-rate phase-distortion amount
 * - output     : audio out
 *
 * Continuous params (frequency/position/warp) are AudioParams handled by the
 * base class. Discrete config (mode/unison/detune/envelope) goes via port.
 */
export class VirtualWavetableNode extends VirtualNode<
  CustomNode & WavetableFlowNodeProps,
  AudioWorkletNode | undefined
> {
  public connectHandleNames: string[] = ["main-input", "frequency", "position", "warp"];

  private inputGain?: GainNode;
  private outputGain?: GainNode;
  private worklet?: AudioWorkletNode;
  private workletReady = false;
  private pendingParamInputs: { source: AudioNode; handle: string }[] = [];

  private initial: { frequency: number; position: number; warp: number; mode: number; unison: number; detune: number; a: number; d: number; s: number; r: number };

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & WavetableFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    this.initial = this.read(node.data || {});
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

  private read(d: any) {
    return {
      frequency: this.num(d.frequency, 220),
      position: this.num(d.position, 0),
      warp: this.num(d.warp, 0),
      mode: this.num(d.mode, 0),
      unison: this.num(d.unison, 1),
      detune: this.num(d.detune, 12),
      a: this.num(d.attack, 0.01),
      d: this.num(d.decay, 0.3),
      s: this.num(d.sustain, 0.8),
      r: this.num(d.release, 0.3),
    };
  }

  private async initWorklet() {
    if (!this.audioContext || !this.inputGain || !this.outputGain) return;
    try {
      await this.audioContext.audioWorklet.addModule("/WavetableProcessor.js");
      const wasmModule = await compileWasmModule("/wavetable.wasm");
      const worklet = new AudioWorkletNode(this.audioContext, "wavetable-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmModule },
      });
      this.worklet = worklet;
      this.inputGain.connect(worklet);
      worklet.connect(this.outputGain);
      this.audioNode = worklet; // base class drives frequency/position/warp AudioParams

      this.applyInitialToNode();
      this.workletReady = true;
      this.flushPendingParamInputs();
    } catch (e) {
      console.error("[VirtualWavetableNode] Failed to init worklet:", e);
    }
  }

  render(data?: Partial<WavetableFlowNodeProps["data"]>) {
    if (data) this.initial = this.read({ ...this.flatten(), ...data });
    if (this.workletReady) this.applyInitialToNode();
  }

  private flatten(): Record<string, number> {
    const o = this.initial;
    return { frequency: o.frequency, position: o.position, warp: o.warp, mode: o.mode, unison: o.unison, detune: o.detune, attack: o.a, decay: o.d, sustain: o.s, release: o.r };
  }

  private applyInitialToNode() {
    if (!this.worklet) return;
    const params = this.worklet.parameters as Map<string, AudioParam>;
    const set = (name: string, value: number) => { const p = params.get(name); if (p) p.value = value; };
    set("frequency", this.initial.frequency);
    set("position", this.initial.position);
    set("warp", this.initial.warp);
    this.pushConfig();
  }

  private pushConfig() {
    if (!this.worklet) return;
    this.worklet.port.postMessage({
      mode: this.initial.mode,
      unison: this.initial.unison,
      detune: this.initial.detune,
      env: { a: this.initial.a, d: this.initial.d, s: this.initial.s, r: this.initial.r },
    });
  }

  /** Discrete config → port; continuous (frequency/position/warp) → base AudioParam path. */
  handleUpdateParams(node: CustomNode & WavetableFlowNodeProps, data: any) {
    if (data && data.data) {
      const d = data.data;
      if ("mode" in d || "unison" in d || "detune" in d || "attack" in d || "decay" in d || "sustain" in d || "release" in d) {
        this.initial = this.read({ ...this.flatten(), ...d });
        this.pushConfig();
      } else {
        // keep cached scalar values in sync for frequency/position/warp
        this.initial = this.read({ ...this.flatten(), ...d });
      }
    }
    super.handleUpdateParams(node, data);
  }

  public connectToInput(source: AudioNode, handleName: string): void {
    if (handleName === "frequency" || handleName === "position" || handleName === "warp") {
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
      try { const param = params.get(handle); if (param) source.connect(param); } catch (e) { console.warn("[VirtualWavetableNode] pending param input connect failed:", e); }
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

export default VirtualWavetableNode;
