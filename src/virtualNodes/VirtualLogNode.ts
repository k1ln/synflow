import EventBus from '../sys/EventBus';

// VirtualLogNode: listens to receiveNodeOn/off events and logs them
// It does not connect to audio graph; purely observational.
export class VirtualLogNode {
  public node: any;
  private eventBus: EventBus;
  private recent: { t: number; type: 'on' | 'off'; payload: any }[] = [];
  private maxEntries: number = 20;

  constructor(eventBus: EventBus, node: any) {
    this.eventBus = eventBus;
    this.node = node;
    if (typeof node.data?.maxEntries === 'number') {
      this.maxEntries = node.data.maxEntries;
    }
    this.subscribe();
  }

  private push(type: 'on' | 'off', payload: any) {
    this.recent.unshift({ t: Date.now(), type, payload });
    if (this.recent.length > this.maxEntries) this.recent.length = this.maxEntries;
  }

  private subscribe() {
    const onEvent = this.node.id + '.main-input.receiveNodeOn';
    const offEvent = this.node.id + '.main-input.receiveNodeOff';
    const handleOn = (payload: any) => {
      console.log('[VirtualLogNode ON]', this.node.id, payload);
      this.push('on', payload);
    };
    const handleOff = (payload: any) => {
      console.log('[VirtualLogNode OFF]', this.node.id, payload);
      this.push('off', payload);
    };
    this.eventBus.subscribe(onEvent, handleOn);
    this.eventBus.subscribe(offEvent, handleOff);
  }

  // Expose recent entries if needed
  getEntries() {
    return [...this.recent];
  }
}

export default VirtualLogNode;
