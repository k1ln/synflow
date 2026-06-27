import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";

export type EventNodeData = {
  id: string;
  listener?: string;
  functionCode: string;
};

export default class VirtualEventNode extends VirtualNode<CustomNode & { data: EventNodeData }, undefined> {
  private listener?: string;
  private functionCode: string;
  private externalHandler?: (payload: any) => void;

  constructor(eventBus: EventBus, node: CustomNode & { data: EventNodeData }, private handleConnected: (node: CustomNode, data: unknown, eventType: string) => void) {
    super(undefined, undefined, eventBus, node);
    this.listener = node.data.listener;
    this.functionCode = node.data.functionCode || "return main;";

    // react to params updates
    this.eventBus.subscribe(`${this.node.id}.params.updateParams`, (params: any) => {
      const d = params?.data || params;
      if (!d) return;
      if (typeof d.listener === 'string') {
        // resubscribe if listener changed
        if (this.listener && this.externalHandler) {
          this.eventBus.unsubscribe(this.listener, this.externalHandler);
        }
        this.listener = d.listener;
        if (this.listener) {
          this.externalHandler = (payload:any)=> this.emitTransformed(payload, 'receiveNodeOn');
          this.eventBus.subscribe(this.listener, this.externalHandler);
        }
      }
      if (typeof d.functionCode === 'string') this.functionCode = d.functionCode;
    });

    // listen to main-input to forward as external emit shortcut
    this.eventBus.subscribe(`${this.node.id}.main-input.receiveNodeOn`, (inputData: any) => {
      const val = inputData?.value ?? inputData;
      this.emitTransformed(val, "receiveNodeOn");
    });
    this.eventBus.subscribe(`${this.node.id}.main-input.receiveNodeOff`, (inputData: any) => {
      const val = inputData?.value ?? inputData;
      this.emitTransformed(val, "receiveNodeOff");
    });

    // if a listener is defined, subscribe and forward
    if (this.listener) {
      this.externalHandler = (payload:any)=> this.emitTransformed(payload, 'receiveNodeOn');
      this.eventBus.subscribe(this.listener, this.externalHandler);
    }
  }

  private emitTransformed(main: any, kind: 'receiveNodeOn'|'receiveNodeOff'){
    try {
      const func = new Function('main', `${this.functionCode}`);
      const result = func(main);
      if (kind==='receiveNodeOn') {
        this.eventBus.emit(`${this.node.id}.main-input.sendNodeOn`, { value: result });
      } else {
        this.eventBus.emit(`${this.node.id}.main-input.sendNodeOff`, { value: result });
      }
      this.handleConnected(this.node as any, { value: result }, kind);
    } catch (e) {
      this.eventBus.emit(`${this.node.id}.main-input.sendNodeOn`, { value: { error: String(e) } });
      this.handleConnected(this.node as any, { value: { error: String(e) } }, 'receiveNodeOn');
    }
  }
}
