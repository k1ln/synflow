import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import MidiManager from '../components/MidiManager';

export type CurveType = 'linear' | 'logarithmic' | 'exponential';
export type MidiKnobMapping = { type: 'cc'; channel: number; number: number } | null;

export type MidiKnobNodeProps = {
  data: {
    label?: string;
    min?: number;
    max?: number;
    curve?: CurveType;
    value?: number;
    midiMapping?: MidiKnobMapping;
  };
};

export default class VirtualMidiKnobNode extends VirtualNode<CustomNode & MidiKnobNodeProps, undefined> {
  private value: number = 0;
  private min: number = 0;
  private max: number = 1;
  private curve: CurveType = 'linear';
  private midiMapping: MidiKnobMapping = null;
  private unsubscribeMidi: (() => void) | null = null;
  private handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void;
  private _lastSnapshot: { value:number; min:number; max:number; curve:CurveType; midiMapping:MidiKnobMapping } | null = null;

  constructor(eventBus: EventBus, node: CustomNode & MidiKnobNodeProps, handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void) {
    super(undefined, undefined, eventBus, node);
    this.handleConnectedEdges = handleConnectedEdges;

    const d = node.data || {} as any;
    this.value = typeof d.value === 'number' ? d.value : 0;
    this.min = typeof d.min === 'number' ? d.min : 0;
    this.max = typeof d.max === 'number' ? d.max : 1;
    this.curve = (d.curve || 'linear') as CurveType;
    this.midiMapping = d.midiMapping ?? null;

    this.subscribeAll();
    this.setupMidi();
    // Initial render-like emission to align with oscillator pattern
    this.render(this.value, this.min, this.max, this.curve, this.midiMapping);
  }

  private subscribeAll(){
    // Triggered from upstream nodes: emit current value
    this.eventBus.subscribe(this.node.id + '.main-input.receiveNodeOn', this.handleReceiveNodeOn);
    // MIDI learn request from UI
    this.eventBus.subscribe(this.node.id + '.updateParams.midiLearn', (data:any)=>{ this.startMidiLearn(); });
  }

  private handleReceiveNodeOn = (data:any)=>{
    this.handleConnectedEdges(this.node, { value: this.value }, 'receiveNodeOn');
  };

  // Override base signature: (node, data)
  public handleUpdateParams(node: any, payload: any){
    const d = payload?.data || payload || {};
    let changed = false;
    if (typeof d.min === 'number' && d.min !== this.min){ this.min = d.min; changed = true; }
    if (typeof d.max === 'number' && d.max !== this.max){ this.max = d.max; changed = true; }
    if (typeof d.value === 'number' && d.value !== this.value){ this.value = d.value; changed = true; }
    if (typeof d.curve === 'string' && d.curve !== this.curve){ this.curve = d.curve as CurveType; changed = true; }
    if ('midiMapping' in d && d.midiMapping !== this.midiMapping){ this.midiMapping = d.midiMapping; changed = true; }
    if (changed){
      this.render(this.value, this.min, this.max, this.curve, this.midiMapping);
    }
  }

  // Consolidated emission similar to oscillator render (no AudioNode to rebuild)
  public render(value:number, min:number, max:number, curve:CurveType, midiMapping:MidiKnobMapping){
    const snap = { value, min, max, curve, midiMapping };
    const differs = !this._lastSnapshot || Object.keys(snap).some(k => (snap as any)[k] !== (this._lastSnapshot as any)[k]);
    if (!differs) return;
    this._lastSnapshot = snap;
    // Emit internal params channel (distinct from UI-driven .params.updateParams to avoid loops)
    this.eventBus.emit(this.node.id + '.params.updateParams.internal', { nodeid: this.node.id, data: { value, min, max, curve, midiMapping } });
    // Downstream trigger with current value
    this.handleConnectedEdges(this.node, { value }, 'receiveNodeOn');
  }

  private mapCcToValue(v: number){ // v in 0..127
    const t = Math.min(1, Math.max(0, v/127));
    const lo = this.min; const hi = this.max; const span = hi - lo;
    switch(this.curve){
      case 'linear': return lo + span * t;
      case 'exponential': return lo + span * Math.pow(t, 3);
      case 'logarithmic': {
        const EPS = 1e-4; const loP = Math.max(EPS, lo); const hiP = Math.max(loP+EPS, hi); const r = hiP/loP;
        return loP * Math.pow(r, t);
      }
    }
  }

  private async setupMidi(){
    const midi = MidiManager.getInstance();
    try { await midi.ensureAccess(); } catch(e){ console.warn('[VirtualMidiKnob] MIDI not available', e); return; }
    if (this.unsubscribeMidi) { this.unsubscribeMidi(); this.unsubscribeMidi = null; }
    this.unsubscribeMidi = midi.onMessage(({ status, channel, data1, data2 })=>{
      // Only handle CC messages
      if ((status & 0xF0) !== 0xB0) return;
      if (!this.midiMapping) return;
      if (channel !== this.midiMapping.channel) return;
      if (data1 !== this.midiMapping.number) return;
      const newVal = this.mapCcToValue(data2);
      this.value = newVal;
      // Push live param update for UI sync
      this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { value: newVal } });
      this.render(this.value, this.min, this.max, this.curve, this.midiMapping);
    });
  }

  private startMidiLearn(){
    const midi = MidiManager.getInstance();
    let unsub: (()=>void) | null = null;
    unsub = midi.onMessage(({ status, channel, data1 })=>{
      const statusHi = status & 0xF0;
      if (statusHi === 0xB0){ // CC only
        this.midiMapping = { type: 'cc', channel, number: data1 };
        // Notify UI and save mapping
        this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { midiMapping: this.midiMapping } });
        // Force render so downstream sees mapping change contextually
        this.render(this.value, this.min, this.max, this.curve, this.midiMapping);
        if (unsub) { try { unsub(); } catch { /* ignore */ } }
      }
    });
  }

  dispose(){
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
    if (this.unsubscribeMidi) this.unsubscribeMidi();
  }
}
