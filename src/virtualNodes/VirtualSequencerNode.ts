import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import { loadRootHandle, writeAudioBlob } from '../util/FileSystemAudioStore';

export interface SequencerVirtualData {
  squares?: number;
  rows?: number;
  activeIndex?: number;
  label?: string;
  onChange?: (d: any) => void;
}
export type SequencerRuntimeNode = CustomNode & { data: any } & { id: string };

// Virtual representation controlling advancement/reset via events
export class VirtualSequencerNode extends VirtualNode<
  SequencerRuntimeNode,
  undefined
> {
  private total: number;
  private rows: number;
  private active: number;
  private patterns: boolean[][]; // 2D array: rows × steps
  private pulseLengths: number[]; // per-step pulse lengths (ms)
  private handleSendNodeOn?: (data: any) => void;
  private handleSendNodeOff?: (data: any) => void;
  private defaultPulseMs = 10;

  constructor(
    audioContext: AudioContext | undefined,
    eventBus: EventBus,
    node: SequencerRuntimeNode
  ) {
    super(audioContext, undefined, eventBus, node);
    this.total = node.data?.squares ?? 8;
    this.rows = Math.max(1, Math.min(25, node.data?.rows ?? 1));
    this.active = node.data?.activeIndex ?? 0;

    // Initialize patterns from incoming data
    const incoming = node.data?.patterns ?? node.data?.pattern;
    if (
      Array.isArray(incoming) &&
      incoming.length > 0 &&
      Array.isArray(incoming[0])
    ) {
      // Already 2D
      this.patterns = [];
      for (let r = 0; r < this.rows; r++) {
        const row = incoming[r];
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
    } else if (Array.isArray(incoming)) {
      // Legacy 1D pattern
      const row = incoming
        .slice(0, this.total)
        .concat(
          Array(Math.max(0, this.total - incoming.length)).fill(true)
        );
      this.patterns = [row];
      for (let r = 1; r < this.rows; r++) {
        this.patterns.push(
          Array.from({ length: this.total }, () => true)
        );
      }
    } else {
      // Default all true
      this.patterns = Array.from({ length: this.rows }, () =>
        Array.from({ length: this.total }, () => true)
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
    // advance handle
    this.eventBus.subscribe(
      this.node.id + '.advance.receiveNodeOn',
      () => this.advance()
    );
    this.eventBus.subscribe(
      this.node.id + '.advance.receivenodeOn',
      () => this.advance()
    );
    // reset handle
    this.eventBus.subscribe(
      this.node.id + '.reset.receiveNodeOn',
      () => this.reset()
    );
    this.eventBus.subscribe(
      this.node.id + '.reset.receivenodeOn',
      () => this.reset()
    );
    // generic main-input trigger advances sequence (acts like clock)
    this.eventBus.subscribe(
      this.node.id + '.main-input.receiveNodeOn',
      () => this.advance()
    );
    this.eventBus.subscribe(
      this.node.id + '.main-input.receivenodeOn',
      () => this.advance()
    );
    // Parameter updates from UI node
    this.eventBus.subscribe(
      this.node.id + '.params.updateParams',
      (p: any) => {
        if (p?.data.from === 'VirtualSequencerNode') return;
        const d = p?.data || p;
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
          this.resizePatterns();
          changed = true;
        }

        if (typeof d.squares === 'number' && d.squares !== this.total) {
          this.total = Math.max(1, Math.min(128, d.squares));
          this.resizePatterns();
          if (this.pulseLengths.length !== this.total) {
            this.pulseLengths = this.pulseLengths
              .slice(0, this.total)
              .concat(
                Array(
                  Math.max(0, this.total - this.pulseLengths.length)
                ).fill(this.defaultPulseMs)
              );
          }
          if (this.active >= this.total) {
            this.active = Math.max(0, this.total - 1);
          }
          changed = true;
        }

        if (Array.isArray(d.patterns)) {
          // 2D patterns array
          const incoming = d.patterns as boolean[][];
          this.patterns = [];
          for (let r = 0; r < this.rows; r++) {
            const row = incoming[r];
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
          // Legacy 1D pattern
          const incoming = d.pattern;
          const adjusted = incoming
            .slice(0, this.total)
            .concat(
              Array(
                Math.max(0, this.total - incoming.length)
              ).fill(true)
            );
          if (this.patterns.length > 0) {
            this.patterns[0] = adjusted;
          } else {
            this.patterns = [adjusted];
          }
          changed = true;
        }

        if (Array.isArray(d.pulseLengths)) {
          const incoming = d.pulseLengths;
          const adjusted = incoming
            .slice(0, this.total)
            .concat(
              Array(
                Math.max(0, this.total - incoming.length)
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
          if (this.node.data) {
            this.node.data.activeIndex = this.active;
            this.node.data.squares = this.total;
            this.node.data.rows = this.rows;
            this.node.data.patterns = this.patterns;
            this.node.data.pulseLengths = this.pulseLengths;
            this.node.data.defaultPulseMs = this.defaultPulseMs;
          }
        }
      }
    );
  }

  private resizePatterns() {
    // Adjust row count
    while (this.patterns.length < this.rows) {
      this.patterns.push(
        Array.from({ length: this.total }, () => true)
      );
    }
    if (this.patterns.length > this.rows) {
      this.patterns = this.patterns.slice(0, this.rows);
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
  }

  private sync() {
    if (this.node.data) {
      this.node.data.activeIndex = this.active;
      this.node.data.squares = this.total;
      this.node.data.rows = this.rows;
      this.node.data.patterns = this.patterns;
      this.node.data.pulseLengths = this.pulseLengths;
      this.node.data.defaultPulseMs = this.defaultPulseMs;
      this.eventBus.emit(
        'FlowNode.' + this.node.id + '.params.updateParams',
        {
          nodeid: this.node.id,
          data: {
            activeIndex: this.active,
            squares: this.total,
            rows: this.rows,
            patterns: this.patterns,
            pulseLengths: this.pulseLengths,
            defaultPulseMs: this.defaultPulseMs,
            from: 'VirtualSequencerNode'
          }
        }
      );
      this.persistPatternSnapshot();
    }
  }

  advance() {
    this.resizePatterns();
    if (this.pulseLengths.length !== this.total) {
      this.pulseLengths = this.pulseLengths
        .slice(0, this.total)
        .concat(
          Array(
            Math.max(0, this.total - this.pulseLengths.length)
          ).fill(this.defaultPulseMs)
        );
    }
    const next = (this.active + 1) % this.total;
    const wrapped = next === 0 && this.active !== 0;
    this.active = next;
    this.sync();

    // Fire pulse for each row where step is enabled
    for (let rowIndex = 0; rowIndex < this.rows; rowIndex++) {
      if (this.patterns[rowIndex]?.[this.active]) {
        this.firePulse(this.active, rowIndex);
      }
    }

    // Emit sync pulse only on wrap to first position
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
    this.active = 0;
    this.sync();
    // Also emit a sync pulse on explicit reset
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
    const payload = {
      index: stepIndex,
      row: rowIndex,
      gate: 1,
      sourceHandle: `row-${rowIndex}`
    };

    // Emit to row-specific output handle
    this.eventBus.emit(
      this.node.id + '.row-' + rowIndex + '.sendNodeOn',
      payload
    );

    // Also emit to legacy main-input for backward compatibility (row 0 only)
    if (rowIndex === 0) {
      this.eventBus.emit(
        this.node.id + '.main-input.sendNodeOn',
        { ...payload, sourceHandle: 'main-input' }
      );
    }

    // Schedule OFF
    setTimeout(
      () => {
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
      },
      this.pulseLengths[stepIndex] ?? this.defaultPulseMs
    );
  }

  private _lastPersist = 0;
  private async persistPatternSnapshot() {
    if (typeof window === 'undefined') return;
    const now = performance.now();
    if (now - this._lastPersist < 2000) return;
    this._lastPersist = now;
    try {
      const root = await loadRootHandle();
      if (!root) return;
      const payload = {
        id: this.node.id,
        updatedAt: new Date().toISOString(),
        activeIndex: this.active,
        squares: this.total,
        rows: this.rows,
        patterns: this.patterns,
        pulseLengths: this.pulseLengths,
        defaultPulseMs: this.defaultPulseMs
      };
      const blob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: 'application/json' }
      );
      const fname = `sequencer-${this.node.id}-pattern.json`;
      await writeAudioBlob(root, 'sampling', blob, fname);
    } catch (e) {
      console.warn('[VirtualSequencerNode] pattern persist failed', e);
    }
  }

  private rowHandlerCleanups: (() => void)[] = [];

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

export default VirtualSequencerNode;
