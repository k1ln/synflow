import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

export interface MouseTriggerButtonNodeData {
  id: string;
  label?: string;
  style?: React.CSSProperties;
}

export type MouseTriggerCustomNode = CustomNode & { data: MouseTriggerButtonNodeData };

/**
 * Virtual node for MouseTriggerButton. No underlying AudioNode; purely event based.
 */
export class VirtualMouseTriggerButtonNode extends VirtualNode<MouseTriggerCustomNode, undefined> {
  constructor(eventBus: EventBus, node: MouseTriggerCustomNode){
    super(undefined, undefined, eventBus, node);
  }

  render(){
    // Subscribe to style/background updates if needed later.
  }
}

export default VirtualMouseTriggerButtonNode;
