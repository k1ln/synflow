import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import { UnisonEndFlowNodeProps } from "../nodes/UnisonEndFlowNode";

type UnisonEndRuntimeNode = CustomNode & UnisonEndFlowNodeProps;

export class VirtualUnisonEndNode extends VirtualNode<UnisonEndRuntimeNode, GainNode> {
    constructor(audioContext: AudioContext | undefined, eventBus: EventBus, node: UnisonEndRuntimeNode) {
        const gainNode = audioContext ? audioContext.createGain() : undefined;
        if (gainNode) gainNode.gain.value = 1;
        super(audioContext, gainNode as GainNode, eventBus, node);
    }

    dispose() {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
        this.disconnect();
    }
}

export default VirtualUnisonEndNode;
