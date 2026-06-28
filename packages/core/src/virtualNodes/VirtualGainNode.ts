import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";

export class VirtualGainNode extends VirtualNode<GainNode> {
    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode) {
        super(
            audioContext, 
            audioContext.createGain(), 
            eventBus, 
            node
        );
    }

    render(gain: number = 1) {
        this.audioNode!.gain.value = gain;
    }
}

export default VirtualGainNode;