import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
export class VirtualMasterOut {
    public audioNode: AudioContext;
    public eventBus: EventBus;
    public node: CustomNode;

    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode) {
        this.audioNode = audioContext;
        this.eventBus = eventBus;
        this.node = node;
    }

    // You can add context-specific methods here if needed
}


export default VirtualMasterOut;