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

    render(filterType: BiquadFilterType = "lowpass", frequency: number = 1000) {
        this.audioNode!.type = filterType;
        this.audioNode!.frequency.value = frequency;
        // Ensure deterministic defaults for reusable automation: detune, Q, gain -> 0
        try { this.audioNode!.detune.value = 0; } catch {}
        try { this.audioNode!.Q.value = 0; } catch {}
        try { this.audioNode!.gain.value = 0; } catch {}
    }
}

export default VirtualBiquadFilterNode;