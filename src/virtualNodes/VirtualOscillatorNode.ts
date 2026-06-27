import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode, ExtendedOscillatorNode } from "../sys/AudioGraphManager";
import { OscillatorFlowNodeProps } from "../nodes/OscillatorFlowNode";

export class VirtualOscillatorNode extends VirtualNode<CustomNode & OscillatorFlowNodeProps> {
    
    constructor(
        audioContext: AudioContext,
        eventBus: EventBus,
        node:CustomNode & OscillatorFlowNodeProps
    ) {
        // Pass a dummy oscillator to the base, will be replaced in render
        super(
            audioContext,
            audioContext.createOscillator() as ExtendedOscillatorNode, 
            eventBus, 
            node
        );
    }

    handleReceiveNodeOnOscillator(node: ExtendedOscillatorNode, data: any) {
        if (node.playbackState !== "started") {
            // Custom logic for starting oscillator if needed
        }
    }

    handleReceiveNodeOffOscillator(node: ExtendedOscillatorNode, data: any) {
        node.stop();
        node.playbackState = "stopped";
    }

    render(
        frequency: number,
        type: OscillatorType,
    ) {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
        // Stop and replace the old oscillator if it exists
        if (this.audioNode && this.audioNode.playbackState === "started") {
            this.audioNode.stop();
            this.audioNode.playbackState = "stopped";
        }
        this.audioNode = this.audioContext!.createOscillator() as ExtendedOscillatorNode;
        this.audioNode.frequency.value = frequency || 440;
        this.audioNode.type = type || "sine";
        this.audioNode.start();
        this.audioNode.playbackState = "started";
        this.subscribeParams();
        this.eventBus.subscribe(
            this.node.id + ".main-input.receiveNodeOn",
            (data) => this.handleReceiveNodeOnOscillator(this.audioNode!, data)
        );
        this.eventBus.subscribe(
            this.node.id + ".main-input.receiveNodeOff",
            (data) => this.handleReceiveNodeOffOscillator(this.audioNode!, data)
        );
    }
}

export default VirtualOscillatorNode;