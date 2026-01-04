import VirtualNode from './VirtualNode';
import { CustomNode } from '../sys/AudioGraphManager';
import EventBus from '../sys/EventBus';
import { OnOffButtonFlowNodeProps as OnOffButtonNodeProps } from '../nodes/OnOffButtonFlowNode';

/**
 * VirtualOnOffButtonNode
 * Handles event bus logic for gating nodeOn/nodeOff events based on gate state controlled by toggle-input.
 * GUI component handles local UI only. This virtual node is authoritative for propagation.
 */
export class VirtualOnOffButtonNode extends VirtualNode<CustomNode & OnOffButtonNodeProps, GainNode> {
  private isOn: boolean;
  private handleSendNodeOn?: (data: any) => void;
  private handleSendNodeOff?: (data: any) => void;
  private _toggleOnRefGUI?: () => void;
  private _toggleOnRef?: () => void;
  private _toggleOffRef?: () => void;
  private _inOnRef?: (p: any) => void;
  private _inOffRef?: (p: any) => void;
  private _manualOnRef?: (p: any) => void;
  private _manualOffRef?: (p: any) => void;

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & OnOffButtonNodeProps) {
    let audioNode = audioContext.createGain();
    audioNode.gain.value = node.data.isOn ? 1 : 0;
    super(audioContext, audioNode, eventBus, node);
    // Dummy audio node
    this.isOn = node.data.isOn;
    this.subscribe();
  }

  private subscribe() {
    // Toggle input events
    this._toggleOnRefGUI = () => {
      const bl = this.isOn
      this.audioNode!.gain.value = bl ? 1 : 0;
      this.setGate(bl);
      //this.eventBus.emit('params.updateParams', { nodeid: this.node.id, data: { isOn: bl } });
    }
    this._toggleOnRef = () => {
      const bl = !this.isOn
      this.audioNode!.gain.value = bl ? 1 : 0;
      this.setGate(bl);
      //this.eventBus.emit('params.updateParams', { nodeid: this.node.id, data: { isOn: bl } });
    }
    this._inOnRef = (p: any) => this.handleIncoming('On', p);
    this._inOffRef = (p: any) => this.handleIncoming('Off', p);
    // Manual trigger events from UI
    this._manualOnRef = (p: any) => this.handleIncoming('On', { ...p, manual: true });
    this._manualOffRef = (p: any) => this.handleIncoming('Off', { ...p, manual: true });
    this.eventBus.subscribe(this.node.id + '.toggle-inputGUI.receiveNodeOn', this._toggleOnRefGUI);
    this.eventBus.subscribe(this.node.id + '.toggle-input.receiveNodeOn', this._toggleOnRef);
    // Main input events
    this.eventBus.subscribe(this.node.id + '.main-input.receiveNodeOn', this._inOnRef);
    this.eventBus.subscribe(this.node.id + '.main-input.receiveNodeOff', this._inOffRef);
    // Manual UI events
    this.eventBus.subscribe(this.node.id + '.manual.triggerOn', this._manualOnRef);
    this.eventBus.subscribe(this.node.id + '.manual.triggerOff', this._manualOffRef);
    // Param updates from UI
    this.eventBus.subscribe(this.node.id + '.params.updateParams', (p: any) => {
      const d = p?.data; if (d && typeof d.isOn === 'boolean') { this.isOn = d.isOn; (this.node.data as any).isOn = d.isOn; }
    });
  }

  private handleIncoming(kind: 'On' | 'Off', payload: any) {
    if (!this.isOn) return; // gate closed
    const path = `${this.node.id}.main-input.sendNode${kind}`;
    this.eventBus.emit(path, { nodeid: this.node.id, gated: true, source: payload?.eventName });
  }

  private setGate(v: boolean) {
    if (this.isOn === v) return;
    this.isOn = v;
    (this.node.data as any).isOn = v;
    // Visual feedback via style background event (optional)
    this.eventBus.emit(this.node.id + '.style.background', { color: v ? '#0a0' : '#333' });
    // Emit params update so React UI syncs
    this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { isOn: v } });
  }

  public setSendNodeOn(handler: (data: any) => void) {
    if (this.handleSendNodeOn) this.eventBus.unsubscribe(this.node.id + '.main-input.sendNodeOn', this.handleSendNodeOn as any);
    this.handleSendNodeOn = handler;
    this.eventBus.subscribe(this.node.id + '.main-input.sendNodeOn', handler);
  }
  public setSendNodeOff(handler: (data: any) => void) {
    if (this.handleSendNodeOff) this.eventBus.unsubscribe(this.node.id + '.main-input.sendNodeOff', this.handleSendNodeOff as any);
    this.handleSendNodeOff = handler;
    this.eventBus.subscribe(this.node.id + '.main-input.sendNodeOff', handler);
  }

  public dispose() {
    if (this.handleSendNodeOn) this.eventBus.unsubscribe(this.node.id + '.main-input.sendNodeOn', this.handleSendNodeOn);
    if (this.handleSendNodeOff) this.eventBus.unsubscribe(this.node.id + '.main-input.sendNodeOff', this.handleSendNodeOff);
    if (this._toggleOnRefGUI) this.eventBus.unsubscribe(this.node.id + '.toggle-inputGUI.receiveNodeOn', this._toggleOnRefGUI);
    if (this._toggleOnRef) this.eventBus.unsubscribe(this.node.id + '.toggle-input.receiveNodeOn', this._toggleOnRef);
    if (this._inOnRef) this.eventBus.unsubscribe(this.node.id + '.main-input.receiveNodeOn', this._inOnRef);
    if (this._inOffRef) this.eventBus.unsubscribe(this.node.id + '.main-input.receiveNodeOff', this._inOffRef);
  }
}

export default VirtualOnOffButtonNode;
