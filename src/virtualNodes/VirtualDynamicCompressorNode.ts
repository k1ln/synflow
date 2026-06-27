import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";

export class VirtualDynamicCompressorNode extends VirtualNode<DynamicsCompressorNode> {
    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode) {
        super(
            audioContext, 
            audioContext.createDynamicsCompressor(), 
            eventBus, 
            node
        );
    }

    render(
        threshold: number = -24,
        knee: number = 30,
        ratio: number = 12,
        attack: number = 0.003,
        release: number = 0.25
    ) {
        this.audioNode!.threshold.value = threshold;
        this.audioNode!.knee.value = knee;
        this.audioNode!.ratio.value = ratio;
        this.audioNode!.attack.value = attack;
        this.audioNode!.release.value = release;
    }
}

export default VirtualDynamicCompressorNode;