import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode, ExtendedOscillatorNode } from "../sys/AudioGraphManager";
import { OscillatorFlowNodeProps, buildPulsePeriodicWave } from "../nodes/OscillatorFlowNode";

export class VirtualOscillatorNode extends VirtualNode<CustomNode & OscillatorFlowNodeProps> {
    private resetConnectionsOfNode: (nodeId: string) => void;
    
    constructor(
        audioContext: AudioContext,
        eventBus: EventBus,
        node:CustomNode & OscillatorFlowNodeProps,
        resetConnectionsOfNode: (nodeId: string) => void
    ) {
        // Pass a dummy oscillator to the base, will be replaced in render
        super(
            audioContext,
            audioContext.createOscillator() as ExtendedOscillatorNode, 
            eventBus, 
            node
        );
        this.resetConnectionsOfNode = resetConnectionsOfNode;
    }

    handleUpdateParams(node: CustomNode & OscillatorFlowNodeProps, payload: any) {
        if (!payload || !payload.data) return;
        const data = node.data;
        let shouldRerender = false;
        
        Object.keys(payload.data).forEach((key) => {
            const value = payload.data[key];
            switch (key) {
                case "pulseWidth":
                    data.pulseWidth = value;
                    shouldRerender = true;
                    break;
                case "periodicWaveHarmonics":
                    data.periodicWaveHarmonics = value;
                    shouldRerender = true;
                    break;
                case "type":
                    data.type = value;
                    shouldRerender = true;
                    break;
                case "frequency":
                    data.frequency = value;
                    shouldRerender = true;
                    break;
                default:
                    super.handleUpdateParams(node, { data: { [key]: value } });
            }
        });
        
        if (shouldRerender) {
            this.render(
                data.frequency || 440,
                data.type || "sine",
                data.pulseWidth,
                data.periodicWaveHarmonics
            );
        }
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
        pulseWidth?: number,
        periodicWaveHarmonics?: number,
    ) {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
        // Stop and disconnect the old oscillator if it exists
        if (this.audioNode && this.audioNode.playbackState === "started") {
            try {
                this.audioNode.stop();
                this.audioNode.playbackState = "stopped";
            } catch (e) {
                // Oscillator may already be stopped
            }
        }
        // Disconnect old oscillator from the audio graph
        try {
            (this.audioNode as any)?.disconnect?.();
        } catch (e) {
            // Node may not be connected
        }
        
        // Create new oscillator
        this.audioNode = this.audioContext!.createOscillator() as ExtendedOscillatorNode;
        this.audioNode.frequency.value = frequency || 440;

        // Apply periodic wave for custom type, otherwise use built-in waveform
        if (type === "custom" && this.audioContext) {
            const pw = pulseWidth ?? 0.5;
            const harmonics = periodicWaveHarmonics ?? 128;
            const periodicWave = buildPulsePeriodicWave(this.audioContext, pw, harmonics);
            this.audioNode.setPeriodicWave(periodicWave);
        } else {
            this.audioNode.type = type || "sine";
        }
        this.audioNode.start();
        this.audioNode.playbackState = "started";
        
        // Reconnect the new oscillator to all its destinations
        this.resetConnectionsOfNode(this.node.id);
        
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