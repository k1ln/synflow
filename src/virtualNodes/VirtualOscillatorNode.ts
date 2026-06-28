import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode, ExtendedOscillatorNode } from "../sys/AudioGraphManager";
import { OscillatorFlowNodeProps, buildPulsePeriodicWave, buildWavetablePeriodicWave } from "../nodes/OscillatorFlowNode";

export class VirtualOscillatorNode extends VirtualNode<CustomNode & OscillatorFlowNodeProps> {
    private resetConnectionsOfNode: (nodeId: string) => void;
    private gainNode?: GainNode;

    /** Returns the GainNode — this is the audio output that connects to other nodes. */
    getOutputNode(): AudioNode | undefined {
        return this.gainNode;
    }

    /** Returns the raw OscillatorNode — used by AudioGraphManager for param connections (frequency, detune). */
    getParamNode(): AudioNode | undefined {
        return this.audioNode;
    }
     
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

    
    /** Apply the correct waveform to the running oscillator without tearing it down. */
    private applyWaveform() {
        const osc = this.audioNode as any;
        if (!osc || !this.audioContext) return;
        const data = this.node.data;
        if (data.type === 'custom') {
            if (data.customMode === 'wavetable' && Array.isArray(data.wavetable) && data.wavetable.length > 0) {
                osc.setPeriodicWave(buildWavetablePeriodicWave(this.audioContext, data.wavetable));
            } else {
                osc.setPeriodicWave(buildPulsePeriodicWave(this.audioContext, data.pulseWidth ?? 0.5, data.periodicWaveHarmonics ?? 128));
            }
        } else {
            try { osc.type = data.type || 'sine'; } catch (_) {}
        }
    }

    handleUpdateParams(node: CustomNode & OscillatorFlowNodeProps, payload: any) {
        if (!payload || !payload.data) return;
        const data = node.data;
        
        Object.keys(payload.data).forEach((key) => {
            const value = payload.data[key];
            switch (key) {
                case "gain":
                    if (this.gainNode) {
                        this.gainNode.gain.setTargetAtTime(
                            Math.min(10000, Math.max(0, value)),
                            this.audioContext!.currentTime,
                            0.01
                        );
                    }
                    data.gain = value;
                    break;
                case "wavetable":
                    data.wavetable = value;
                    if (data.type === 'custom' && data.customMode === 'wavetable' && Array.isArray(value)) {
                        this.applyWaveform();
                    }
                    break;
                case "customMode":
                    data.customMode = value;
                    this.applyWaveform();
                    break;
                case "type":
                    if (data.type !== value) {
                        data.type = value;
                        this.applyWaveform();
                    }
                    break;
                case "pulseWidth":
                    data.pulseWidth = value;
                    if (data.type === 'custom' && data.customMode !== 'wavetable') {
                        this.applyWaveform();
                    }
                    break;
                case "periodicWaveHarmonics":
                    data.periodicWaveHarmonics = value;
                    if (data.type === 'custom' && data.customMode !== 'wavetable') {
                        this.applyWaveform();
                    }
                    break;
                default:
                    super.handleUpdateParams(node, { data: { [key]: value } });
            }
        });
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
        detune?: number
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
        this.audioNode.detune.value = detune ||  0;
        console.log("create oscillator with params", { frequency, type, pulseWidth, periodicWaveHarmonics, detune });
        // Apply periodic wave for custom type, otherwise use built-in waveform
        if (type === "custom" && this.audioContext) {
            const data = this.node.data;
            if (data.customMode === 'wavetable' && Array.isArray(data.wavetable) && data.wavetable.length > 0) {
                const wave = buildWavetablePeriodicWave(this.audioContext, data.wavetable);
                this.audioNode.setPeriodicWave(wave);
            } else {
                const pw = pulseWidth ?? 0.5;
                const harmonics = periodicWaveHarmonics ?? 128;
                const periodicWave = buildPulsePeriodicWave(this.audioContext, pw, harmonics);
                this.audioNode.setPeriodicWave(periodicWave);
            }
        } else {
            this.audioNode.type = type || "sine";
        }
        this.audioNode.start();
        this.audioNode.playbackState = "started";

        // Create / recreate the built-in gain node and chain oscillator → gain
        try { this.gainNode?.disconnect(); } catch (_) {}
        this.gainNode = this.audioContext!.createGain();
        this.gainNode.gain.value = Math.max(0, this.node.data.gain ?? 1);
        this.audioNode.connect(this.gainNode);
        
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