import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus, { EventCallback } from "../sys/EventBus";
import { ClockNodeProps } from "../nodes/ClockFlowNode";

/**
 * Additional optional configuration that can be supplied via the node's data / params update.
 *  sendOff?: boolean                -> Whether to emit a corresponding OFF event each cycle.
 *  offDelayMs?: number | string     -> Delay (ms) after ON before emitting OFF (default 50) OR
 *                                      if sendOffBeforeNextOn=true: offset (ms) BEFORE the next ON (default 10).
 *                                      Can be provided as a number or numeric string (e.g. "75").
 *  sendOffBeforeNextOn?: boolean    -> If true, schedule OFF before the NEXT ON instead of after the current ON.
 */
export interface ClockOffConfig {
    sendOff?: boolean;
    offDelayMs?: number | string;
    sendOffBeforeNextOn?: boolean;
}

/**
 * VirtualClockFlowNode emits periodic "main-input.sendNodeOn" events based on BPM.
 * Uses high-resolution timing with drift correction for consistent musical timing.
 */
export class VirtualClockNode extends VirtualNode<CustomNode & ClockNodeProps, undefined> {
    private isEmitting: boolean = true;
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private highResInterval: ReturnType<typeof setInterval> | null = null;
    private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    private offTimeout: ReturnType<typeof setTimeout> | null = null;
    private startTime: number = 0;
    private tickCount: number = 0;
    private lastTickTime: number = 0;
    private emitEventsForConnectedEdges: (
        node: CustomNode & ClockNodeProps,
        data: any,
        eventType: string
    ) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & ClockNodeProps,
        emitEventsForConnectedEdges: (
            node: CustomNode & ClockNodeProps,
            data: any,
            eventType: string
        ) => void
    ) {
        super(undefined, undefined, eventBus, node);
        this.emitEventsForConnectedEdges = emitEventsForConnectedEdges;
        const d: any = node.data || {};
        const initOn = typeof d.isEmitting === 'boolean' ? d.isEmitting : true;
        d.isEmitting = initOn;
        node.data = d as any;
        this.isEmitting = initOn;
    }

    handleReceiveNodeOn = () => {
        this.isEmitting = !this.isEmitting;
        if (this.isEmitting) {
            this.start();
        } else {
            this.stop();
        }
    };

    render(bpm: number = 120) {
        this.eventBus.unsubscribeAll(`${this.node.id}.main-input.receiveNodeOn`);
        this.eventBus.subscribe(`${this.node.id}.main-input.receiveNodeOn`, this.handleReceiveNodeOn);
        this.eventBus.unsubscribeAll(`${this.node.id}.main-input.sendNodeOn`);
        this.eventBus.subscribe(`${this.node.id}.main-input.sendNodeOn`, (data) => {
            this.emitEventsForConnectedEdges(
                this.node,
                data,
                `receiveNodeOn`
            );
        });
        // Forward OFF events just like ON events when they are enabled
        this.eventBus.unsubscribeAll(`${this.node.id}.main-input.sendNodeOff`);
        this.eventBus.subscribe(`${this.node.id}.main-input.sendNodeOff`, (data) => {
            this.emitEventsForConnectedEdges(
                this.node,
                data,
                `receiveNodeOff`
            );
        });
        this.eventBus.subscribe(`${this.node.id}.params.updateParams`, (data) =>
            this.handleUpdateParams(this.node, data)
        );
        // Only start if isEmitting is true (respects saved off state)
        if (this.isEmitting) {
            this.start();
        }
    }

    handleUpdateParams(node: CustomNode & ClockNodeProps, data: any) {
        // Allow dynamic extension of node.data with additional clock config fields.
        const target: any = node.data as any;
        const allowed = ['sendOff','offDelayMs','sendOffBeforeNextOn','bpm','isEmitting'];
        let nextEmit: boolean | null = null;
        if (data && data.data && typeof data.data === 'object') {
            Object.keys(data.data).forEach((key) => {
                if (key in target || allowed.includes(key)) {
                    // Normalize boolean-like strings
                    let value: any = data.data[key];
                    if (['true','false'].includes(String(value))) {
                        value = String(value) === 'true';
                    }
                    // Store raw; we'll coerce offDelayMs later when used.
                    target[key] = value;
                    if (key === 'isEmitting' && typeof value === 'boolean') {
                        nextEmit = value;
                    }
                }
            });
        }
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        this.debounceTimeout = setTimeout(() => {
            if (nextEmit === false) {
                this.stop();
            } else if (nextEmit === true) {
                this.start();
            }
            // If nextEmit is null, don't change start/stop state
        }, 200);
    }

    start() {
        this.stop();
        this.isEmitting = true;
        this.startTime = performance.now();
        this.tickCount = 0;
        this.lastTickTime = this.startTime;
        this.syncState();
        
        // Use a high-resolution polling interval (every 5ms) for precise timing
        // This compensates for setTimeout's imprecision (can be up to 15ms late)
        this.scheduleNextTick();
    }

    private scheduleNextTick() {
        if (!this.isEmitting) return;
        
        const data: any = this.node.data || {};
        const bpm: number = (data.bpm || 120);
        const intervalMs = (60 / bpm) * 1000;
        
        const nextTickTime = this.startTime + (this.tickCount * intervalMs);
        const now = performance.now();
        const delay = nextTickTime - now;
        
        if (delay <= 0) {
            // Time to fire now (or we're late)
            this.fireTick();
        } else if (delay < 20) {
            // Less than 20ms away - use high-resolution polling
            this.highResInterval = setInterval(() => {
                const currentTime = performance.now();
                if (currentTime >= nextTickTime) {
                    if (this.highResInterval) {
                        clearInterval(this.highResInterval);
                        this.highResInterval = null;
                    }
                    this.fireTick();
                }
            }, 1); // Poll every 1ms for precision
        } else {
            // More than 20ms away - use setTimeout then switch to high-res
            this.timeout = setTimeout(() => {
                this.scheduleNextTick(); // Re-evaluate with high-res polling
            }, delay - 15); // Wake up 15ms early to switch to high-res
        }
    }

    private fireTick() {
        if (!this.isEmitting) return;
        
        const data: any = this.node.data || {};
        const bpm: number = (data.bpm || 120);
        const intervalMs = (60 / bpm) * 1000;
        
        this.lastTickTime = performance.now();

        // Emit ON first
        this.eventBus.emit(
            `${this.node.id}.main-input.sendNodeOn`,
            { nodeId: this.node.id }
        );
        this.tickCount++;

        // Clear any previous OFF timeout before scheduling a new one
        if (this.offTimeout) {
            clearTimeout(this.offTimeout);
            this.offTimeout = null;
        }

        // Optional OFF scheduling
        if (data.sendOff) {
            const beforeNext = !!data.sendOffBeforeNextOn;
            const normalizeDelay = (raw: any, def: number) => {
                if (raw === undefined || raw === null || raw === '') {
                    return def;
                }
                if (typeof raw === 'number' && !isNaN(raw)) return raw;
                if (typeof raw === 'string') {
                    const match = raw.trim().match(/^-?\d+(?:\.\d+)?/);
                    if (match) {
                        const num = parseFloat(match[0]);
                        if (!isNaN(num)) return num;
                    }
                }
                return def;
            };

            if (beforeNext) {
                let offset = normalizeDelay(data.offDelayMs, 10);
                if (offset >= intervalMs) offset = intervalMs - 1;
                if (offset < 1) offset = 1;
                const fireIn = intervalMs - offset;
                this.offTimeout = setTimeout(() => {
                    if (!this.isEmitting) return;
                    this.eventBus.emit(
                        `${this.node.id}.main-input.sendNodeOff`,
                        { nodeId: this.node.id }
                    );
                }, fireIn);
            } else {
                let delay = normalizeDelay(data.offDelayMs, 50);
                if (delay >= intervalMs) {
                    delay = Math.max(1, intervalMs - 1);
                }
                if (delay < 1) delay = 1;
                this.offTimeout = setTimeout(() => {
                    if (!this.isEmitting) return;
                    this.eventBus.emit(
                        `${this.node.id}.main-input.sendNodeOff`,
                        { nodeId: this.node.id }
                    );
                }, delay);
            }
        }

        // Schedule next tick
        this.scheduleNextTick();
    }

    // Legacy interval method - kept for reference but no longer used
    interval() {
        this.fireTick();
    }

    stop() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.highResInterval) {
            clearInterval(this.highResInterval);
            this.highResInterval = null;
        }
        if (this.offTimeout) {
            clearTimeout(this.offTimeout);
            this.offTimeout = null;
        }
        this.isEmitting = false;
        this.syncState();
    }

    private syncState() {
        const data: any = this.node.data || {};
        data.isEmitting = this.isEmitting;
        this.node.data = data;
        this.eventBus.emit('params.updateParams', { nodeid: this.node.id, data: { isEmitting: this.isEmitting } });
    }

    // Optionally, call this to clean up when node is removed
    dispose() {
        // Disposing VirtualClockNode
        this.stop();
    }
}

export default VirtualClockNode;