import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

export interface SequencerFrequencyVirtualData {
  squares?: number;
  rows?: number;
  patterns?: boolean[][];
  pattern?: boolean[];
  notes?: string[][];
  frequencies?: number[][];
  pulseLengths?: number[];
  defaultPulseMs?: number;
}

export type SequencerFrequencyRuntimeNode = CustomNode &
  { data: any } &
  { id: string };

export class VirtualSequencerFrequencyNode extends VirtualNode<
  SequencerFrequencyRuntimeNode,
  undefined
> {
  private total: number;
  private rows: number;
  private active: number; // sequential pointer like VirtualSampleNode
  private patterns: boolean[][];
  private notes: string[][];
  private frequencies: number[][];
  private pulseLengths: number[];
  private defaultPulseMs = 100;
  // Track currently active steps and their scheduled OFF timers
  private activeSteps: Set<string> = new Set(); // "row-step" keys
  private offTimeouts: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  // Track a simple cycle index to emit sync when wrapping
  private cycleIndex: number = 0;
  // Optional external subscriptions
  private handleSendNodeOn?: (data: any) => void;
  private handleSendNodeOff?: (data: any) => void;
  private eventHandleSendNodeOn?: (data: any) => void;
  private eventHandleSendNodeOff?: (data: any) => void;

  constructor(
    audioContext: AudioContext | undefined,
    eventBus: EventBus,
    node: SequencerFrequencyRuntimeNode
  ) {
    super(audioContext, undefined, eventBus, node);
    this.total = node.data?.squares ?? 8;
    this.rows = Math.max(1, Math.min(25, node.data?.rows ?? 1));
    this.active = Math.max(
      0,
      Math.min(this.total - 1, node.data?.activeIndex ?? 0)
    );

    // Initialize 2D patterns
    const incomingPatterns = node.data?.patterns ?? node.data?.pattern;
    if (
      Array.isArray(incomingPatterns) &&
      incomingPatterns.length > 0 &&
      Array.isArray(incomingPatterns[0])
    ) {
      this.patterns = [];
      for (let r = 0; r < this.rows; r++) {
        const row = incomingPatterns[r];
        if (Array.isArray(row)) {
          this.patterns.push(
            row
              .slice(0, this.total)
              .concat(
                Array(Math.max(0, this.total - row.length)).fill(true)
              )
          );
        } else {
          this.patterns.push(
            Array.from({ length: this.total }, () => true)
          );
        }
      }
    } else if (Array.isArray(incomingPatterns)) {
      const row = (incomingPatterns as boolean[])
        .slice(0, this.total)
        .concat(
          Array(
            Math.max(0, this.total - incomingPatterns.length)
          ).fill(true)
        );
      this.patterns = [row];
      for (let r = 1; r < this.rows; r++) {
        this.patterns.push(
          Array.from({ length: this.total }, () => true)
        );
      }
    } else {
      this.patterns = Array.from({ length: this.rows }, () =>
        Array.from({ length: this.total }, () => true)
      );
    }

    // Initialize 2D notes
    const incomingNotes = node.data?.notes;
    if (
      Array.isArray(incomingNotes) &&
      incomingNotes.length > 0 &&
      Array.isArray(incomingNotes[0])
    ) {
      this.notes = [];
      for (let r = 0; r < this.rows; r++) {
        const row = incomingNotes[r];
        if (Array.isArray(row)) {
          this.notes.push(
            row
              .slice(0, this.total)
              .concat(
                Array(Math.max(0, this.total - row.length)).fill('A4')
              )
          );
        } else {
          this.notes.push(
            Array.from({ length: this.total }, () => 'A4')
          );
        }
      }
    } else if (Array.isArray(incomingNotes)) {
      const row = (incomingNotes as string[])
        .slice(0, this.total)
        .concat(
          Array(
            Math.max(0, this.total - incomingNotes.length)
          ).fill('A4')
        );
      this.notes = [row];
      for (let r = 1; r < this.rows; r++) {
        this.notes.push(
          Array.from({ length: this.total }, () => 'A4')
        );
      }
    } else {
      this.notes = Array.from({ length: this.rows }, () =>
        Array.from({ length: this.total }, () => 'A4')
      );
    }

    // Initialize 2D frequencies
    const incomingFreqs = node.data?.frequencies;
    if (
      Array.isArray(incomingFreqs) &&
      incomingFreqs.length > 0 &&
      Array.isArray(incomingFreqs[0])
    ) {
      this.frequencies = [];
      for (let r = 0; r < this.rows; r++) {
        const row = incomingFreqs[r];
        if (Array.isArray(row)) {
          this.frequencies.push(
            row
              .slice(0, this.total)
              .concat(
                Array(Math.max(0, this.total - row.length)).fill(440)
              )
          );
        } else {
          this.frequencies.push(
            Array.from({ length: this.total }, () => 440)
          );
        }
      }
    } else if (Array.isArray(incomingFreqs)) {
      const row = (incomingFreqs as number[])
        .slice(0, this.total)
        .concat(
          Array(
            Math.max(0, this.total - incomingFreqs.length)
          ).fill(440)
        );
      this.frequencies = [row];
      for (let r = 1; r < this.rows; r++) {
        this.frequencies.push(
          Array.from({ length: this.total }, () => 440)
        );
      }
    } else {
      this.frequencies = Array.from({ length: this.rows }, () =>
        Array.from({ length: this.total }, () => 440)
      );
    }

    if (typeof node.data?.defaultPulseMs === 'number') {
      this.defaultPulseMs = node.data.defaultPulseMs;
    }
    const incomingPulse = Array.isArray(node.data?.pulseLengths)
      ? node.data.pulseLengths
      : [];
    this.pulseLengths = incomingPulse
      .slice(0, this.total)
      .concat(
        Array(
          Math.max(0, this.total - incomingPulse.length)
        ).fill(this.defaultPulseMs)
      );
    this.installSubscriptions();
  }

  private installSubscriptions() {
    // Advance triggers (compat variants)
    this.eventBus.subscribe(
      this.node.id + '.advance.receiveNodeOn',
      () => this.advance()
    );

    // Reset triggers (compat variants)
    this.eventBus.subscribe(
      this.node.id + '.reset.receiveNodeOn',
      () => this.reset()
    );

    // Some graphs emit Off on reset edges too; treat both as reset
    this.eventBus.subscribe(
      this.node.id + '.reset.receivenodeOff',
      () => this.reset()
    );
    // Main input clock behaves like advance
    this.eventBus.subscribe(
      this.node.id + '.main-input.receiveNodeOn',
      () => this.advance()
    );

    this.eventBus.subscribe(
      this.node.id + '.params.updateParams',
      (p: any) => {
        const d = p?.data || p;
        if (d?.from === 'VirtualSequencerFrequencyNode') return;
        if (!d) return;
        let changed = false;

        if (typeof d.defaultPulseMs === 'number') {
          const newVal = Math.max(1, Math.min(5000, d.defaultPulseMs));
          if (newVal !== this.defaultPulseMs) {
            this.defaultPulseMs = newVal;
            changed = true;
          }
        }

        if (typeof d.rows === 'number' && d.rows !== this.rows) {
          this.rows = Math.max(1, Math.min(25, d.rows));
          this.resize();
          changed = true;
        }

        if (typeof d.squares === 'number' && d.squares !== this.total) {
          this.total = Math.max(1, Math.min(128, d.squares));
          this.resize();
          if (this.active >= this.total) {
            this.active = Math.max(0, this.total - 1);
          }
          changed = true;
        }

        if (Array.isArray(d.patterns)) {
          this.patterns = [];
          for (let r = 0; r < this.rows; r++) {
            const row = d.patterns[r];
            if (Array.isArray(row)) {
              this.patterns.push(
                row
                  .slice(0, this.total)
                  .concat(
                    Array(
                      Math.max(0, this.total - row.length)
                    ).fill(true)
                  )
              );
            } else {
              this.patterns.push(
                Array.from({ length: this.total }, () => true)
              );
            }
          }
          changed = true;
        } else if (Array.isArray(d.pattern)) {
          const adjusted = d.pattern
            .slice(0, this.total)
            .concat(
              Array(
                Math.max(0, this.total - d.pattern.length)
              ).fill(true)
            );
          if (this.patterns.length > 0) {
            this.patterns[0] = adjusted;
          } else {
            this.patterns = [adjusted];
          }
          changed = true;
        }

        if (Array.isArray(d.notes)) {
          if (
            d.notes.length > 0 &&
            Array.isArray(d.notes[0])
          ) {
            this.notes = [];
            for (let r = 0; r < this.rows; r++) {
              const row = d.notes[r];
              if (Array.isArray(row)) {
                this.notes.push(
                  row
                    .slice(0, this.total)
                    .concat(
                      Array(
                        Math.max(0, this.total - row.length)
                      ).fill('A4')
                    )
                );
              } else {
                this.notes.push(
                  Array.from({ length: this.total }, () => 'A4')
                );
              }
            }
          } else {
            const adjusted = (d.notes as string[])
              .slice(0, this.total)
              .concat(
                Array(
                  Math.max(0, this.total - d.notes.length)
                ).fill('A4')
              );
            if (this.notes.length > 0) {
              this.notes[0] = adjusted;
            } else {
              this.notes = [adjusted];
            }
          }
          changed = true;
        }

        if (Array.isArray(d.frequencies)) {
          if (
            d.frequencies.length > 0 &&
            Array.isArray(d.frequencies[0])
          ) {
            this.frequencies = [];
            for (let r = 0; r < this.rows; r++) {
              const row = d.frequencies[r];
              if (Array.isArray(row)) {
                this.frequencies.push(
                  row
                    .slice(0, this.total)
                    .concat(
                      Array(
                        Math.max(0, this.total - row.length)
                      ).fill(440)
                    )
                );
              } else {
                this.frequencies.push(
                  Array.from({ length: this.total }, () => 440)
                );
              }
            }
          } else {
            const adjusted = (d.frequencies as number[])
              .slice(0, this.total)
              .concat(
                Array(
                  Math.max(0, this.total - d.frequencies.length)
                ).fill(440)
              );
            if (this.frequencies.length > 0) {
              this.frequencies[0] = adjusted;
            } else {
              this.frequencies = [adjusted];
            }
          }
          changed = true;
        }

        if (Array.isArray(d.pulseLengths)) {
          const adjusted = d.pulseLengths
            .slice(0, this.total)
            .concat(
              Array(
                Math.max(0, this.total - d.pulseLengths.length)
              ).fill(this.defaultPulseMs)
            );
          if (
            adjusted.some(
              (v: number, i: number) => v !== this.pulseLengths[i]
            )
          ) {
            this.pulseLengths = adjusted;
            changed = true;
          }
        }

        if (changed) {
          this.sync(true);
        }
      }
    );
  }

  private resize() {
    // Adjust row count
    while (this.patterns.length < this.rows) {
      this.patterns.push(
        Array.from({ length: this.total }, () => true)
      );
      this.notes.push(
        Array.from({ length: this.total }, () => 'A4')
      );
      this.frequencies.push(
        Array.from({ length: this.total }, () => 440)
      );
    }
    if (this.patterns.length > this.rows) {
      this.patterns = this.patterns.slice(0, this.rows);
      this.notes = this.notes.slice(0, this.rows);
      this.frequencies = this.frequencies.slice(0, this.rows);
    }

    // Adjust step count per row
    this.patterns = this.patterns.map((row) => {
      if (row.length < this.total) {
        return [
          ...row,
          ...Array.from(
            { length: this.total - row.length },
            () => true
          )
        ];
      }
      if (row.length > this.total) {
        return row.slice(0, this.total);
      }
      return row;
    });

    this.notes = this.notes.map((row) => {
      if (row.length < this.total) {
        return [
          ...row,
          ...Array.from(
            { length: this.total - row.length },
            () => 'A4'
          )
        ];
      }
      if (row.length > this.total) {
        return row.slice(0, this.total);
      }
      return row;
    });

    this.frequencies = this.frequencies.map((row) => {
      if (row.length < this.total) {
        return [
          ...row,
          ...Array.from(
            { length: this.total - row.length },
            () => 440
          )
        ];
      }
      if (row.length > this.total) {
        return row.slice(0, this.total);
      }
      return row;
    });

    if (this.pulseLengths.length !== this.total) {
      this.pulseLengths = this.pulseLengths
        .slice(0, this.total)
        .concat(
          Array(
            Math.max(0, this.total - this.pulseLengths.length)
          ).fill(this.defaultPulseMs)
        );
    }
  }

  private sync(emit: boolean) {
    if (this.node.data) {
      this.node.data.activeIndex = this.active;
      this.node.data.squares = this.total;
      this.node.data.rows = this.rows;
      this.node.data.patterns = this.patterns;
      this.node.data.notes = this.notes;
      this.node.data.frequencies = this.frequencies;
      this.node.data.pulseLengths = this.pulseLengths;
      this.node.data.defaultPulseMs = this.defaultPulseMs;
    }
    if (emit) {
      this.eventBus.emit(
        'FlowNode.' + this.node.id + '.params.updateParams',
        {
          nodeid: this.node.id,
          data: {
            activeIndex: this.active,
            squares: this.total,
            rows: this.rows,
            patterns: this.patterns,
            notes: this.notes,
            frequencies: this.frequencies,
            pulseLengths: this.pulseLengths,
            defaultPulseMs: this.defaultPulseMs,
            from: 'VirtualSequencerFrequencyNode'
          }
        }
      );
    }
  }

  advance() {
    this.resize();
    const next = (this.active + 1) % Math.max(1, this.total);
    const wrapped = next === 0 && this.active !== 0;
    this.active = next;
    this.sync(true);

    // Fire pulse for each row where step is enabled
    for (let rowIndex = 0; rowIndex < this.rows; rowIndex++) {
      if (this.patterns[rowIndex]?.[this.active]) {
        this.firePulse(this.active, rowIndex);
      }
    }

    if (wrapped) {
      this.eventBus.emit(
        this.node.id + '.sync.receiveNodeOn',
        { gate: 1, index: 0 }
      );
      setTimeout(
        () =>
          this.eventBus.emit(
            this.node.id + '.sync.receiveNodeOff',
            { gate: 0, index: 0 }
          ),
        0
      );
    }
  }

  reset() {
    // Immediately turn off any active pulses and clear timers
    this.offTimeouts.forEach((tid) => {
      try {
        clearTimeout(tid);
      } catch {}
    });
    this.offTimeouts.clear();
    if (this.activeSteps.size) {
      this.activeSteps.forEach((key) => {
        const [rowStr, stepStr] = key.split('-');
        this.handleSendNodeOff?.({
          index: parseInt(stepStr, 10),
          row: parseInt(rowStr, 10),
          gate: 0
        });
      });
      this.activeSteps.clear();
    }
    this.cycleIndex = 0;
    this.active = 0;
    this.sync(true);
    // Emit a sync pulse on reset
    this.eventBus.emit(
      this.node.id + '.sync.sendNodeOn',
      { gate: 1, index: 0 }
    );
    setTimeout(
      () =>
        this.eventBus.emit(
          this.node.id + '.sync.sendNodeOff',
          { gate: 0, index: 0 }
        ),
      0
    );
  }

  private firePulse(stepIndex: number, rowIndex: number = 0) {
    const duration = this.pulseLengths[stepIndex] ?? this.defaultPulseMs;
    const key = `${rowIndex}-${stepIndex}`;
    const freq = this.frequencies[rowIndex]?.[stepIndex] ?? 440;

    // If already active, extend gate by clearing previous OFF timer
    const prev = this.offTimeouts.get(key);
    if (prev) {
      try {
        clearTimeout(prev);
      } catch {}
    } else {
      // Emit ON only when transitioning from inactive -> active
      const payload = {
        index: stepIndex,
        row: rowIndex,
        value: freq,
        sourceHandle: `row-${rowIndex}`
      };

      // Emit to row-specific output handle
      this.eventBus.emit(
        this.node.id + '.row-' + rowIndex + '.sendNodeOn',
        payload
      );

      // Also emit to legacy main-input for backward compat (row 0)
      if (rowIndex === 0) {
        this.eventBus.emit(
          this.node.id + '.main-input.sendNodeOn',
          { ...payload, sourceHandle: 'main-input' }
        );
      }

      this.activeSteps.add(key);
    }

    // Schedule OFF and remember timer
    const tid = setTimeout(() => {
      this.offTimeouts.delete(key);
      if (this.activeSteps.has(key)) {
        this.activeSteps.delete(key);
        const offPayload = {
          index: stepIndex,
          row: rowIndex,
          gate: 0,
          sourceHandle: `row-${rowIndex}`
        };

        this.eventBus.emit(
          this.node.id + '.row-' + rowIndex + '.sendNodeOff',
          offPayload
        );

        if (rowIndex === 0) {
          this.eventBus.emit(
            this.node.id + '.main-input.sendNodeOff',
            { ...offPayload, sourceHandle: 'main-input' }
          );
        }
      }
    }, duration);
    this.offTimeouts.set(key, tid);
  }

  private rowHandlerCleanups: (() => void)[] = [];

  // Public API to allow external code to subscribe to output events
  public setSendNodeOn(handler: (data: any) => void) {
    // Clean up old handlers
    this.rowHandlerCleanups.forEach((cleanup) => cleanup());
    this.rowHandlerCleanups = [];

    // Legacy main-input handler
    const mainCh = this.node.id + '.main-input.sendNodeOn';
    if (this.handleSendNodeOn) {
      this.eventBus.unsubscribe(mainCh, this.handleSendNodeOn as any);
    }
    this.handleSendNodeOn = handler;
    this.eventBus.subscribe(mainCh, handler);

    // Subscribe to all row handles (up to 25)
    for (let r = 0; r < 25; r++) {
      const rowCh = this.node.id + '.row-' + r + '.sendNodeOn';
      this.eventBus.subscribe(rowCh, handler);
      this.rowHandlerCleanups.push(() => {
        this.eventBus.unsubscribe(rowCh, handler);
      });
    }
  }

  private rowOffHandlerCleanups: (() => void)[] = [];

  public setSendNodeOff(handler: (data: any) => void) {
    // Clean up old handlers
    this.rowOffHandlerCleanups.forEach((cleanup) => cleanup());
    this.rowOffHandlerCleanups = [];

    // Legacy main-input handler
    const mainCh = this.node.id + '.main-input.sendNodeOff';
    if (this.handleSendNodeOff) {
      this.eventBus.unsubscribe(mainCh, this.handleSendNodeOff as any);
    }
    this.handleSendNodeOff = handler;
    this.eventBus.subscribe(mainCh, handler);

    // Subscribe to all row handles (up to 25)
    for (let r = 0; r < 25; r++) {
      const rowCh = this.node.id + '.row-' + r + '.sendNodeOff';
      this.eventBus.subscribe(rowCh, handler);
      this.rowOffHandlerCleanups.push(() => {
        this.eventBus.unsubscribe(rowCh, handler);
      });
    }
  }
}

export default VirtualSequencerFrequencyNode;
