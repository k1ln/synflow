import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import {
  FlowEventFreqShifterFlowNodeProps,
} from "../nodes/FlowEventFreqShifterFlowNode";

/**
 * VirtualFlowEventFreqShifterNode shifts frequency values
 * in flow events by a specified number of semitones.
 *
 * This node does NOT process audio signals.
 * It only transforms frequency values in flow events.
 *
 * The pitch shift ratio: 2^(semitones/12)
 * For +2 semitones: ratio = 2^(2/12) ≈ 1.122
 * For -2 semitones: ratio = 2^(-2/12) ≈ 0.891
 */
export class VirtualFlowEventFreqShifterNode {
  private eventBus: EventBus;
  private node: CustomNode & FlowEventFreqShifterFlowNodeProps;
  private shift: number;
  private sendNodeOn?: (data: unknown) => void;
  private sendNodeOff?: (data: unknown) => void;

  constructor(
    eventBus: EventBus,
    node: CustomNode & FlowEventFreqShifterFlowNodeProps
  ) {
    this.eventBus = eventBus;
    this.node = node;
    this.shift = node.data?.shift ?? 0;
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

    // Subscribe to UI parameter updates
    this.eventBus.subscribe(
      `${this.node.id}.params.updateParams`,
      this.handleParamsUpdate
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

  public setShift(semitones: number) {
    // Clamp to valid range
    this.shift = Math.max(-96, Math.min(96, semitones));
  }

  render(shift?: number) {
    if (typeof shift === "number") {
      this.setShift(shift);
    }
  }

  handleUpdateParams(
    node: CustomNode & FlowEventFreqShifterFlowNodeProps,
    data: unknown
  ) {
    this.node = node;
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
    this.eventBus.unsubscribe(
      `${this.node.id}.params.updateParams`,
      this.handleParamsUpdate
    );
  }
}

export default VirtualFlowEventFreqShifterNode;
