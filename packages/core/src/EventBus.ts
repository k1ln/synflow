export type EventCallback = (data?: any) => void;

class EventBus {
  private events: { [eventName: string]: EventCallback[] };
  private static instance: EventBus;
  private id: string;
  //private eventLoggingEnabled: boolean = true;
  //private eventLog: Array<{ eventName: string; data?: any; timestamp: number }> = [];
  constructor() {
    this.events = {};
    this.id = crypto.randomUUID();
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
    if(eventName.indexOf("GUI")>=0){
      // before EventBus emitting GUI event
    }
    if (!this.events[eventName]) return;
    if (data && typeof data === 'object') {
      data.eventName = eventName;
    } else {
      data = { eventName };
    }
    if(eventName.indexOf("GUI")>=0){
      // After EventBus emitting GUI event
    }
    // Call subscribers asynchronously to avoid deep synchronous re-entrancy
    // which can cause "Maximum update depth exceeded" in React when handlers
    // synchronously emit events that trigger each other.
    this.events[eventName].forEach((callback) => {
      // Use setTimeout(,0) to break the sync call-stack; handlers still run soon after.
      setTimeout(() => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error occurred in event handler for ${eventName}:`, error);
        }
      }, 0);
    });
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