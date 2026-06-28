import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import {
  AudioSignalFreqShifterFlowNodeProps,
} from "../nodes/AudioSignalFreqShifterFlowNode";
import { compileWasmModule } from "../sys/wasmUtils";

/**
 * VirtualAudioSignalFreqShifterNode shifts audio signal
 * frequencies by a specified number of semitones using
 * an AudioWorklet processor.
 *
 * The pitch shift ratio: 2^(semitones/12)
 * For +2 semitones: ratio = 2^(2/12) ≈ 1.122
 * For -2 semitones: ratio = 2^(-2/12) ≈ 0.891
 *
 * Uses a simple ring modulation approach for
 * frequency shifting.
 */
export class VirtualAudioSignalFreqShifterNode extends VirtualNode<
  CustomNode & AudioSignalFreqShifterFlowNodeProps,
  AudioWorkletNode | undefined
> {
  private shift: number;
  private workletReady = false;
  private pendingConnections: (AudioNode | AudioParam)[] = [];
  private reconnectTargets: (AudioNode | AudioParam)[] = [];

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & AudioSignalFreqShifterFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    this.shift = node.data?.shift ?? 0;
    this.initWorklet();
    this.subscribeToFlowEvents();
  }

  private async initWorklet() {
    if (!this.audioContext) return;

    try {
      await this.audioContext.audioWorklet.addModule(
        "/AudioSignalFreqShifterProcessor.js"
      );

      const wasmModule = await compileWasmModule('/freq-shifter.wasm');
      this.audioNode = new AudioWorkletNode(
        this.audioContext,
        "audio-signal-freq-shifter-processor",
        { processorOptions: { wasmModule } }
      );

      // Set initial shift value
      const shiftParam = (
        this.audioNode.parameters as Map<string, AudioParam>
      ).get("shift");
      if (shiftParam) {
        shiftParam.value = this.shift;
      }

      this.workletReady = true;
      this.flushPendingConnections();
    } catch (e) {
      console.error(
        "[VirtualAudioSignalFreqShifterNode] " +
        "Failed to init worklet:",
        e
      );
    }
  }

  private subscribeToFlowEvents() {
    // Subscribe to shift-input flow events
    // (receives shift amount in semitones)
    this.eventBus.subscribe(
      `${this.node.id}.shift-input.receiveNodeOn`,
      this.handleShiftInput
    );
    this.eventBus.subscribe(
      `${this.node.id}.shift-input.receiveNodeOff`,
      this.handleShiftInput
    );

    // Subscribe to UI parameter updates
    this.eventBus.subscribe(
      `${this.node.id}.params.updateParams`,
      this.handleParamsUpdate
    );
  }

  /**
   * Handle UI parameter updates from the node.
   */
  private handleParamsUpdate = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;

    const event = payload as {
      nodeid?: string;
      data?: Record<string, unknown>;
    };
    const data = event.data;
    if (data && typeof data.shift === "number") {
      this.setShift(data.shift);
    }
  };

  private handleShiftInput = (data: unknown) => {
    if (!data || typeof data !== "object") return;

    const payload = data as Record<string, unknown>;
    let newShift: number | null = null;

    // Accept value from constant node, function node
    if (typeof payload.value === "number") {
      newShift = payload.value;
    } else if (typeof payload.value === "string") {
      const parsed = parseFloat(payload.value);
      if (!isNaN(parsed)) {
        newShift = parsed;
      }
    }

    if (newShift !== null) {
      this.setShift(newShift);
    }
  };

  public setShift(semitones: number) {
    // Clamp to valid range
    this.shift = Math.max(-96, Math.min(96, semitones));

    if (this.audioNode) {
      // Update via AudioParam
      const shiftParam = (
        this.audioNode.parameters as Map<string, AudioParam>
      ).get("shift");
      if (shiftParam) {
        shiftParam.value = this.shift;
      }
      // Also send message for immediate update
      this.audioNode.port.postMessage({
        type: "setShift",
        value: this.shift,
      });
    }
  }

  render(shift?: number) {
    if (typeof shift === "number") {
      this.setShift(shift);
    }
  }

  handleUpdateParams(
    node: CustomNode & AudioSignalFreqShifterFlowNodeProps,
    data: unknown
  ) {
    super.handleUpdateParams(node, data);
    if (
      data &&
      typeof data === "object" &&
      "data" in data
    ) {
      const payload = (
        data as { data: Record<string, unknown> }
      ).data;
      if (typeof payload.shift === "number") {
        this.setShift(payload.shift);
      }
    }
  }

  connect(destination: AudioNode | AudioParam) {
    if (!this.audioNode || !this.workletReady) {
      this.pendingConnections.push(destination);
      return;
    }
    super.connect(destination);
    if (!this.reconnectTargets.includes(destination)) {
      this.reconnectTargets.push(destination);
    }
  }

  private flushPendingConnections() {
    if (!this.audioNode) return;
    this.pendingConnections.forEach((dest) => {
      try {
        if (dest instanceof AudioNode) {
          this.audioNode!.connect(dest);
        } else if (dest instanceof AudioParam) {
          this.audioNode!.connect(dest);
        }
        if (!this.reconnectTargets.includes(dest)) {
          this.reconnectTargets.push(dest);
        }
      } catch (e) {
        console.warn(
          "[VirtualAudioSignalFreqShifterNode] " +
          "Pending connect failed:",
          e
        );
      }
    });
    this.pendingConnections = [];
  }

  public getOutputNode(): AudioNode | undefined {
    return this.audioNode;
  }

  public dispose() {
    this.eventBus.unsubscribe(
      `${this.node.id}.shift-input.receiveNodeOn`,
      this.handleShiftInput
    );
    this.eventBus.unsubscribe(
      `${this.node.id}.shift-input.receiveNodeOff`,
      this.handleShiftInput
    );
    this.eventBus.unsubscribe(
      `${this.node.id}.params.updateParams`,
      this.handleParamsUpdate
    );
    if (this.audioNode) {
      try {
        this.audioNode.disconnect();
      } catch {
        // Ignore
      }
    }
  }
}

export default VirtualAudioSignalFreqShifterNode;
