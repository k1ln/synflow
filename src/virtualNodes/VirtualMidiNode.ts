import EventBus from '../sys/EventBus';

/**
 * VirtualMidiNode: lightweight utility to subscribe to a MidiFlowNote output without
 * needing a full rendered React node (e.g., headless processing chains).
 * It listens to a given source node id and re-emits a simplified event with just frequency & note.
 */
export class VirtualMidiNode {
  id: string;
  sourceId: string;
  lastFrequency: number = 0;
  lastNote: string = '';
  private bus = EventBus.getInstance();
  private paramsHandler: any;

  constructor(id:string, sourceId:string){
    this.id = id; this.sourceId = sourceId;
    // Listen for param updates coming from the FlowNode's onChange propagation
    
  }

  dispose(){
    this.bus.unsubscribe(`${this.sourceId}.params.updateParams`, this.paramsHandler);
  }
}

export default VirtualMidiNode;
