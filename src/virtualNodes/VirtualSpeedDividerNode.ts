import VirtualNode from './VirtualNode';
import { CustomNode } from '../sys/AudioGraphManager';
import EventBus from '../sys/EventBus';

interface SpeedDividerData {
  divider: number;
  multiplier: number;
  incomingBpm?: number;
}

/**
 * VirtualSpeedDividerNode divides/multiplies incoming events.
 * Divider: waits for N hits before forwarding one event.
 * Multiplier: tracks incoming BPM and emits N evenly spaced
 * events across the interval.
 */
export class VirtualSpeedDividerNode extends VirtualNode<
  CustomNode & { data: SpeedDividerData },
  undefined
> {
  private hitCount = 0;
  private divider = 1;
  private multiplier = 1;
  private lastEventTime = 0;
  private intervalMs = 0;
  private incomingBpm = 0;
  private scheduledTimeouts: number[] = [];
  private sendNodeOn: ((data: any) => void) | null = null;
  private sendNodeOff: ((data: any) => void) | null = null;

  constructor(
    eventBus: EventBus,
    node: CustomNode & { data: SpeedDividerData }
  ) {
    super(undefined, undefined, eventBus, node);
    this.divider = node.data?.divider || 1;
    this.multiplier = node.data?.multiplier || 1;
    this.incomingBpm = node.data?.incomingBpm || 0;
    this.subscribeEvents();
    // Listen for divider value from divider-input handle
    this.eventBus.subscribe(this.node.id + '.divider-input.receiveNodeOn', (payload: any) => {
      const num = payload?.value*1;
      if (typeof num === 'number') {
        this.divider = Math.max(1, Math.min(10, payload.value));
        this.hitCount = 0;
        this.emitHitCount();
      }
    });
    // Listen for multiplier value from multiplier-input handle
    this.eventBus.subscribe(this.node.id + '.multiplier-input.receiveNodeOn', (payload: any) => {
      const num = payload?.value*1;
      if (typeof num === 'number') {
        this.multiplier = Math.max(1, Math.min(10, payload.value));
      }
    });
  }

  private subscribeEvents() {
    // Listen for incoming trigger events
    const onCh = this.node.id + '.input.receiveNodeOn';
    const offCh = this.node.id + '.input.receiveNodeOff';

    this.eventBus.subscribe(onCh, (data: any) => {
      this.handleOn(data);
    });

    this.eventBus.subscribe(offCh, (data: any) => {
      this.handleOff(data);
    });

    // Listen for param updates
    const paramsCh = 'FlowNode.' + this.node.id + '.params.updateParams';
    this.eventBus.subscribe(paramsCh, (payload: any) => {
      if (payload?.data) {
        if (typeof payload.data.divider === 'number') {
          this.divider = Math.max(
            1,
            Math.min(10, payload.data.divider)
          );
          this.hitCount = 0;
          this.emitHitCount();
        }
        if (typeof payload.data.multiplier === 'number') {
          this.multiplier = Math.max(
            1,
            Math.min(10, payload.data.multiplier)
          );
        }
      }
    });
  }

  private handleOn(data: any) {
    const now = performance.now();

    // Calculate interval and BPM from last event
    if (this.lastEventTime > 0) {
      this.intervalMs = now - this.lastEventTime;
      if (this.intervalMs > 0) {
        // BPM = 60000ms / intervalMs
        this.incomingBpm = 60000 / this.intervalMs;
        this.emitBpm();
      }
    }
    this.lastEventTime = now;

    // Clear any pending scheduled events
    this.clearScheduled();

    this.hitCount++;
    this.emitHitCount();

    if (this.hitCount >= this.divider) {
      this.hitCount = 0;
      this.emitHitCount();
      this.fireMultipliedEvents(data);
    }
  }

  private fireMultipliedEvents(data: any) {
    if (!this.sendNodeOn) return;

    // First event fires immediately
    this.sendNodeOn({ ...data, nodeid: this.node.id });

    // If multiplier > 1 and we have a valid interval,
    // schedule remaining events evenly across the interval
    if (this.multiplier > 1 && this.intervalMs > 0) {
      const spacing = this.intervalMs / this.multiplier;
      for (let i = 1; i < this.multiplier; i++) {
        const delay = spacing * i;
        const timeout = window.setTimeout(() => {
          if (this.sendNodeOn) {
            this.sendNodeOn({ ...data, nodeid: this.node.id });
          }
        }, delay);
        this.scheduledTimeouts.push(timeout);
      }
    } else if (this.multiplier > 1) {
      // No interval known yet, fire all immediately
      for (let i = 1; i < this.multiplier; i++) {
        this.sendNodeOn({ ...data, nodeid: this.node.id });
      }
    }
  }

  private clearScheduled() {
    for (const t of this.scheduledTimeouts) {
      window.clearTimeout(t);
    }
    this.scheduledTimeouts = [];
  }

  private handleOff(data: any) {
    if (this.sendNodeOff) {
      this.sendNodeOff({ ...data, nodeid: this.node.id });
    }
  }

  private emitHitCount() {
    this.eventBus.emit(this.node.id + '.status.hitCount', {
      count: this.hitCount
    });
  }

  private emitBpm() {
    this.eventBus.emit(this.node.id + '.status.bpm', {
      bpm: this.incomingBpm
    });
  }

  setSendNodeOn(handler: (data: any) => void) {
    this.sendNodeOn = handler;
  }

  setSendNodeOff(handler: (data: any) => void) {
    this.sendNodeOff = handler;
  }

  render() {
    // No audio rendering needed
  }

  disconnect() {
    this.clearScheduled();
    super.disconnect();
  }
}

export default VirtualSpeedDividerNode;
