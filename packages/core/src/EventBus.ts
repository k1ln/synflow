export type EventCallback = (data?: any) => void;

class EventBus {
  private events: { [eventName: string]: EventCallback[] };
  private static instance: EventBus;
  private id: string;
  //private eventLoggingEnabled: boolean = true;
  //private eventLog: Array<{ eventName: string; data?: any; timestamp: number }> = [];

  // Deferred dispatch queue. Handlers still never run synchronously inside
  // emit() — that is what prevents the React "Maximum update depth exceeded"
  // recursion when a handler re-emits — but instead of one setTimeout(0) per
  // callback (clamped to 1-4ms, competing with rendering, throttled to >=1s in
  // background tabs) we drain a FIFO queue on a single microtask. A cascade of
  // N chained nodes then resolves in one microtask turn with sub-millisecond
  // latency instead of N timer hops, which matters for tight event sources
  // like an incoming MIDI clock.
  private queue: Array<{ cb: EventCallback; data: any; name: string }> = [];
  private flushScheduled = false;
  private draining = false;
  private static readonly MAX_DISPATCHES_PER_FLUSH = 100000;

  constructor() {
    this.events = {};
    this.id = crypto.randomUUID();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.draining) return;
    this.flushScheduled = true;
    const flush = () => this.flushQueue();
    if (typeof queueMicrotask === 'function') queueMicrotask(flush);
    else Promise.resolve().then(flush);
  }

  private flushQueue(): void {
    this.flushScheduled = false;
    if (this.draining) return;
    this.draining = true;
    let guard = 0;
    try {
      // Re-check length each iteration so events emitted by handlers during
      // the drain are delivered in this same turn, in FIFO order.
      while (this.queue.length) {
        if (++guard > EventBus.MAX_DISPATCHES_PER_FLUSH) {
          console.error(
            `[EventBus] flush exceeded ${EventBus.MAX_DISPATCHES_PER_FLUSH} dispatches — dropping ${this.queue.length} queued events (runaway emit loop?)`
          );
          this.queue.length = 0;
          break;
        }
        const job = this.queue.shift()!;
        try {
          job.cb(job.data);
        } catch (error) {
          console.error(`Error occurred in event handler for ${job.name}:`, error);
        }
      }
    } finally {
      this.draining = false;
    }
  }
  /**
   * Get the singleton instance of EventBus.
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to an event.
   * @param eventName - The name of the event to subscribe to.
   * @param callback - The callback function to execute when the event is emitted.
   */
  subscribe(eventName: string, callback: EventCallback): void {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  /**
   * Unsubscribe from an event.
   * @param eventName - The name of the event to unsubscribe from.
   * @param callback - The callback function to remove.
   */
  unsubscribe(eventName: string, callback: EventCallback): void {
    if (!this.events[eventName]) return;

    this.events[eventName] = this.events[eventName].filter((cb) => cb !== callback);

    // Clean up if no callbacks remain for the event
    if (this.events[eventName].length === 0) {
      delete this.events[eventName];
    }
  }

  unsubscribeAll(eventName: string): void {
    if (!this.events[eventName]) return;
    this.events[eventName] = [];
    delete this.events[eventName];
  }

  unsubscribeAllByNodeId(nodeId: string): void {
    const nodeIdString = nodeId;
    Object.keys(this.events).forEach((eventName) => {
      if (eventName.startsWith(nodeIdString) && eventName.indexOf("GUI")===-1) {
        this.events[eventName] = [];
        delete this.events[eventName];
      }
    });
  }
  /**
   * Returns a shallow copy snapshot of current events and their callbacks.
   * Useful for debugging and UI listing.
   */
  getEventsSnapshot(): { [eventName: string]: EventCallback[] } {
    const out: { [eventName: string]: EventCallback[] } = {};
    Object.keys(this.events).forEach(k => { out[k] = [...this.events[k]]; });
    return out;
  }

  /**
   * List all current event names with at least one subscriber.
   */
  listEvents(): string[] {
    return Object.keys(this.events).sort();
  }

  /**
   * Return counts of subscribers per event.
   */
  listEventCounts(): Record<string, number> {
    const m: Record<string, number> = {};
    Object.keys(this.events).forEach(k => m[k] = this.events[k]?.length ?? 0);
    return m;
  }
  /**
   * Emit an event to all subscribers.
   * @param eventName - The name of the event to emit.
   * @param data - Optional data to pass to the event callbacks.
   */
  emit(eventName: string, data?: any): void {
    const subs = this.events[eventName];
    if (!subs || subs.length === 0) return;
    if (data && typeof data === 'object') {
      data.eventName = eventName;
    } else {
      data = { eventName };
    }
    // Snapshot the subscriber list into the queue so subscribe()/unsubscribe()
    // called from a handler during the drain can't corrupt this dispatch.
    for (let i = 0; i < subs.length; i++) {
      this.queue.push({ cb: subs[i], data, name: eventName });
    }
    this.scheduleFlush();
  }
  /**
   * Clear all subscriptions for a specific event or all events.
   * @param eventName - The name of the event to clear (optional).
   */
  clear(eventName?: string): void {
    if (eventName) {
      delete this.events[eventName];
    } else {
      Object.keys(this.events).forEach((event) => {
        if (event.startsWith("FlowNode")) { console.log("Clearing event", event); return; }

        if (event !== "params.updateParams" && event.startsWith("FlowNode") === false) {
          delete this.events[event];
        }
      });
    }
  }
}

export default EventBus;