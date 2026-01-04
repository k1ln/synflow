import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import {
  AudioSignalFreqShifterFlowNodeProps,
} from "../nodes/AudioSignalFreqShifterFlowNode";

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

    const processorCode = `
/**
 * AudioSignalFreqShifterProcessor
 * Shifts audio frequency by semitones.
 * Uses a simple pitch shifting via
 * granular/overlap-add approach.
 */
class AudioSignalFreqShifterProcessor
  extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'shift',
        defaultValue: 0,
        minValue: -96,
        maxValue: 96,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor() {
    super();
    // Ring buffer for overlap-add pitch shift
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.phase = 0;
    // Crossfade window for smooth transitions
    this.windowSize = 512;
    this.window = new Float32Array(this.windowSize);
    for (let i = 0; i < this.windowSize; i++) {
      // Hann window
      this.window[i] = 0.5 * (
        1 - Math.cos(2 * Math.PI * i /
        (this.windowSize - 1))
      );
    }
    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data?.type === 'setShift') {
        // Direct shift update via message
        this._shiftOverride = event.data.value;
      }
    };
    this._shiftOverride = null;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || !output.length) return true;
    if (!input || !input.length || !input[0].length) {
      // No input - output silence
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    // Get shift parameter (in semitones)
    const shiftParam = parameters.shift;
    let shiftSemitones = shiftParam.length > 0
      ? shiftParam[0]
      : 0;
    if (this._shiftOverride !== null) {
      shiftSemitones = this._shiftOverride;
    }

    // Calculate pitch ratio: 2^(semitones/12)
    const pitchRatio = Math.pow(
      2,
      shiftSemitones / 12
    );

    // Process each channel
    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch] || input[0];
      const outCh = output[ch];

      for (let i = 0; i < outCh.length; i++) {
        // Write input to circular buffer
        this.buffer[this.writeIndex] = inCh[i];
        this.writeIndex = (
          this.writeIndex + 1
        ) % this.bufferSize;

        // Read from buffer with pitch-shifted index
        const readPos = (
          this.readIndex + this.phase
        ) % this.bufferSize;
        const readPosInt = Math.floor(readPos);
        const frac = readPos - readPosInt;

        // Linear interpolation for smooth reading
        const s0 = this.buffer[readPosInt];
        const s1 = this.buffer[
          (readPosInt + 1) % this.bufferSize
        ];
        outCh[i] = s0 + frac * (s1 - s0);

        // Advance phase based on pitch ratio
        this.phase += pitchRatio - 1;
        if (this.phase >= this.bufferSize) {
          this.phase -= this.bufferSize;
        }
        if (this.phase < 0) {
          this.phase += this.bufferSize;
        }

        // Advance read index to track write
        this.readIndex = (
          this.readIndex + 1
        ) % this.bufferSize;
      }
    }

    return true;
  }
}

registerProcessor(
  'audio-signal-freq-shifter-processor',
  AudioSignalFreqShifterProcessor
);
`;

    try {
      const blob = new Blob([processorCode], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      this.audioNode = new AudioWorkletNode(
        this.audioContext,
        "audio-signal-freq-shifter-processor"
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
