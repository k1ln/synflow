import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { BiquadFilterFlowNodeProps } from "../nodes/BiquadFilterFlowNode";

export class VirtualBiquadFilterNode extends VirtualNode<CustomNode & BiquadFilterFlowNodeProps, BiquadFilterNode> {
    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & BiquadFilterFlowNodeProps) {
        super(
            audioContext, 
            audioContext.createBiquadFilter(), 
            eventBus, 
            node);
    }

    render(
        filterType: BiquadFilterType = "lowpass", 
        frequency: number = 1000,
        Q: number = 0,
        gain: number = 0,
        detune: number = 0
    ) {
        this.audioNode!.type = filterType;
        this.audioNode!.frequency.value = frequency;
        // Set Q, gain, detune to provided values (defaulting to 0 if not specified)
        try { this.audioNode!.Q.value = Q; } catch {}
        try { this.audioNode!.gain.value = gain; } catch {}
        try { this.audioNode!.detune.value = detune; } catch {}
    }
}

export default VirtualBiquadFilterNode;