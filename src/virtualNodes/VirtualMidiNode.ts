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
    this.paramsHandler = (payload:any)=>{
      const d = payload?.data || {};
      const freq = d.frequency;
      const note = d.lastNote;
      let freqChanged = false;
      let noteChanged = false;
      if(typeof freq === 'number' && freq !== this.lastFrequency){
        this.lastFrequency = freq; freqChanged = true;
      }
      if(typeof note === 'string' && note !== this.lastNote){
        this.lastNote = note; noteChanged = true;
      }
      if(freqChanged || noteChanged){
        if(this.lastFrequency > 0){
          // Active note (ON)
          this.bus.emit(`${this.id}.main-input.sendNodeOn`, { value: this.lastFrequency, frequency: this.lastFrequency, note: this.lastNote });
        } else {
          // Frequency 0 indicates OFF
            this.bus.emit(`${this.id}.main-input.sendNodeOff`, { value: 0, frequency: 0, note: this.lastNote });
        }
      }
    };
    this.bus.subscribe(`${this.sourceId}.params.updateParams`, this.paramsHandler);
  }

  dispose(){
    this.bus.unsubscribe(`${this.sourceId}.params.updateParams`, this.paramsHandler);
  }
}

export default VirtualMidiNode;
