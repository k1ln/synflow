import VirtualNode from './VirtualNode';
import { CustomNode } from '../sys/AudioGraphManager';
import EventBus from '../sys/EventBus';
import EventManager from '../sys/EventManager';
import { MidiButtonNodeProps, MidiButtonMapping } from '../nodes/MidiButtonFlowNode';
import MidiManager from '../components/MidiManager';

export class VirtualMidiButtonNode extends VirtualNode<CustomNode & MidiButtonNodeProps, undefined> {
  private eventManager: EventManager;
  private oldButton: string | null;
  private midiMapping: MidiButtonMapping | null = null;
  private isLearning = false;
  private unsubscribeMidi: (() => void) | null = null;
  private pressed = false;

  constructor(eventManager: EventManager, eventBus: EventBus, node: CustomNode & MidiButtonNodeProps) {
    super(undefined, undefined, eventBus, node);
    this.eventManager = eventManager;
    this.oldButton = this.node.data.assignedKey;
    this.midiMapping = (this.node.data as any).midiMapping || null;
    this.setupMidi();
  }

  render() {
    if (this.oldButton) {
      this.eventManager.removeButtonDownCallback(this.oldButton, this.node.id);
      this.eventManager.removeButtonUpCallback(this.oldButton, this.node.id);
    }
    if (this.node.data.assignedKey) {
      this.eventManager.addButtonDownCallback(this.node.data.assignedKey, this.node.id, () => {
        this.eventBus.emit(this.node.id + '.main-input.sendNodeOn', { nodeid: this.node.id });
      });
      this.eventManager.addButtonUpCallback(this.node.data.assignedKey, this.node.id, () => {
        this.eventBus.emit(this.node.id + '.main-input.sendNodeOff', { nodeid: this.node.id });
      });
    }
    this.oldButton = this.node.data.assignedKey;

    this.eventBus.unsubscribeAll(this.node.id + '.updateParams.params');
    this.eventBus.subscribe(this.node.id + '.params.updateParams', (p) => this.updateParams(p));
    this.eventBus.subscribe(this.node.id + '.updateParams.midiLearn', (p) => {
      if (p?.midiLearn) this.startMidiLearn();
    });
  }

  private updateParams(payload: any) {
    const d = payload?.data ? payload.data : payload;
    if (!d) return;
    if (d.assignedKey && d.assignedKey !== this.node.data.assignedKey) {
      (this.node.data as any).assignedKey = d.assignedKey;
      this.render();
    }
    if (d.midiMapping) {
      this.midiMapping = d.midiMapping;
      (this.node.data as any).midiMapping = d.midiMapping;
    }
  }

  private async setupMidi() {
    try {
      const midi = MidiManager.getInstance();
      await midi.ensureAccess();
      if (this.unsubscribeMidi) this.unsubscribeMidi();
      this.unsubscribeMidi = midi.onMessage(({ status, channel, data1, data2 }) => {
        if (!this.midiMapping) return;
        const statusHi = status & 0xF0;
        if (this.midiMapping.type === 'note' && channel === this.midiMapping.channel && data1 === this.midiMapping.number) {
          const isNoteOn = (statusHi === 0x90 && data2 > 0);
          const isNoteOff = (statusHi === 0x80) || (statusHi === 0x90 && data2 === 0);
          if (isNoteOn && !this.pressed) {
            this.pressed = true;
            this.eventBus.emit(this.node.id + '.main-input.sendNodeOn', { nodeid: this.node.id, source: 'midi' });
          } else if (isNoteOff && this.pressed) {
            this.pressed = false;
            this.eventBus.emit(this.node.id + '.main-input.sendNodeOff', { nodeid: this.node.id, source: 'midi' });
          }
        }
      });
    } catch { /* ignore */ }
  }

  private startMidiLearn() {
    if (this.isLearning) return;
    this.isLearning = true;
    // startMidiLearn
    this.eventBus.emit(this.node.id + '.style.background', { color: '#7a5b00' });
    const midi = MidiManager.getInstance();
    midi.startButtonLearn(this.node.id, (mapping) => {
      this.midiMapping = mapping as any;
      this.finishLearn();
    });
    setTimeout(() => { if (this.isLearning) { this.isLearning = false; midi.cancelButtonLearn(this.node.id); this.eventBus.emit(this.node.id + '.style.background', { color: '#333' }); } }, 10000);
  }

  private finishLearn() {
    this.isLearning = false;
    // finishLearn completed
    this.eventBus.emit(this.node.id + '.style.background', { color: '#333' });
    // Emit node-scoped params update (consumed by virtual node & legacy listeners)
    const responseObject = { nodeid: this.node.id, data: { midiMapping: this.midiMapping } };
    // Finish in VirtualNode
    this.eventBus.emit(this.node.id + '.finishMidiLearn', responseObject);
    // Also emit global params.updateParams so Flow.tsx subscription updates React node state
  }

  public subscribeOnOff(onHandler: (data: any) => void, offHandler: (data: any) => void) {
    this.eventBus.subscribe(
      this.node.id + '.main-input.sendNodeOn',
      (data) => { this.eventBus.emit(this.node.id + '.style.background', { color: 'green' }); onHandler(data); }
    );
    this.eventBus.subscribe(
      this.node.id + '.main-input.sendNodeOff',
      (data) => { this.eventBus.emit(this.node.id + '.style.background', { color: '#333' }); offHandler(data); }
    );
  }
}

export default VirtualMidiButtonNode;
