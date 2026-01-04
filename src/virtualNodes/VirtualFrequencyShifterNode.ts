import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import {
  FrequencyShifterFlowNodeProps,
} from "../nodes/FrequencyShifterFlowNode";

/**
 * VirtualFrequencyShifterNode shifts audio frequencies
 * by a specified number of semitones using an
 * AudioWorklet processor.
 *
 * The pitch shift ratio: 2^(semitones/12)
 * For +2 semitones: ratio = 2^(2/12) ≈ 1.122
 * For -2 semitones: ratio = 2^(-2/12) ≈ 0.891
 *
 * Uses a simple ring modulation approach for
 * frequency shifting.
 */
export class VirtualFrequencyShifterNode extends VirtualNode<
  CustomNode & FrequencyShifterFlowNodeProps,
  AudioWorkletNode | undefined
> {
  private shift: number;
  private workletReady = false;
  private pendingConnections: (AudioNode | AudioParam)[] = [];
  private reconnectTargets: (AudioNode | AudioParam)[] = [];
  private sendNodeOn?: (data: unknown) => void;
  private sendNodeOff?: (data: unknown) => void;

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & FrequencyShifterFlowNodeProps
  ) {
    super(audioContext, undefined, eventBus, node);
    this.shift = node.data?.shift ?? 0;
    this.initWorklet();
    this.subscribeToFlowEvents();
  }

  /**
   * Set handler for sending ON events to connected edges.
   */
  public setSendNodeOn(
    handler: (data: unknown) => void
  ) {
    this.sendNodeOn = handler;
  }

  /**
   * Set handler for sending OFF events to connected edges.
   */
  public setSendNodeOff(
    handler: (data: unknown) => void
  ) {
    this.sendNodeOff = handler;
  }

  private async initWorklet() {
    if (!this.audioContext) return;

    const processorCode = `
/**
 * FrequencyShifterProcessor
 * Shifts audio frequency by semitones.
 * Uses a simple pitch shifting via
 * granular/overlap-add approach.
 */
class FrequencyShifterProcessor
  extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'shift',
        defaultValue: 0,
        minValue: -24,
        maxValue: 24,
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
  'frequency-shifter-processor',
  FrequencyShifterProcessor
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
        "frequency-shifter-processor"
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
        "[VirtualFrequencyShifterNode] " +
        "Failed to init worklet:",
        e
      );
    }
  }

  private subscribeToFlowEvents() {
    // Subscribe to trigger-input flow events
    // (receives frequency, emits shifted frequency)
    this.eventBus.subscribe(
      `${this.node.id}.trigger-input.receiveNodeOn`,
      this.handleReceiveNodeOn
    );
    this.eventBus.subscribe(
      `${this.node.id}.trigger-input.receiveNodeOff`,
      this.handleReceiveNodeOff
    );

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
  }

  /**
   * Calculate shifted frequency.
   * Formula: shiftedFreq = inputFreq * 2^(semitones/12)
   */
  private calculateShiftedFrequency(
    inputFreq: number
  ): number {
    const ratio = Math.pow(2, this.shift / 12);
    return inputFreq * ratio;
  }

  /**
   * When receiving a flow event on trigger-input,
   * apply pitch shift and emit the shifted frequency.
   */
  private handleReceiveNodeOn = (data: unknown) => {
    const payload = data as Record<string, unknown> | null;
    let inputFreq = 440; // Default frequency

    // Extract input frequency from payload
    if (payload) {
      if (typeof payload.value === "number") {
        inputFreq = payload.value;
      } else if (typeof payload.frequency === "number") {
        inputFreq = payload.frequency;
      }
    }

    const shiftedFreq = this.calculateShiftedFrequency(
      inputFreq
    );

    // Emit via the sendNodeOn handler
    this.sendNodeOn?.({
      value: shiftedFreq,
      frequency: shiftedFreq,
      shift: this.shift,
      inputFrequency: inputFreq,
      sourceHandle: "flow-output",
    });
  };

  private handleReceiveNodeOff = (data: unknown) => {
    const payload = data as Record<string, unknown> | null;
    let inputFreq = 440;

    if (payload) {
      if (typeof payload.value === "number") {
        inputFreq = payload.value;
      } else if (typeof payload.frequency === "number") {
        inputFreq = payload.frequency;
      }
    }

    const shiftedFreq = this.calculateShiftedFrequency(
      inputFreq
    );

    // Emit via the sendNodeOff handler
    this.sendNodeOff?.({
      value: shiftedFreq,
      frequency: shiftedFreq,
      shift: this.shift,
      inputFrequency: inputFreq,
      sourceHandle: "flow-output",
    });
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
    this.shift = Math.max(-24, Math.min(24, semitones));

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
    node: CustomNode & FrequencyShifterFlowNodeProps,
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
          "[VirtualFrequencyShifterNode] " +
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
      `${this.node.id}.trigger-input.receiveNodeOn`,
      this.handleReceiveNodeOn
    );
    this.eventBus.unsubscribe(
      `${this.node.id}.trigger-input.receiveNodeOff`,
      this.handleReceiveNodeOff
    );
    this.eventBus.unsubscribe(
      `${this.node.id}.shift-input.receiveNodeOn`,
      this.handleShiftInput
    );
    this.eventBus.unsubscribe(
      `${this.node.id}.shift-input.receiveNodeOff`,
      this.handleShiftInput
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

export default VirtualFrequencyShifterNode;
