import { Edge } from "@xyflow/react";
import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import { UnsisonBeginFlowNodeProps } from "../nodes/UnisonBeginFlowNode";

type UnisonBeginRuntimeNode = CustomNode & UnsisonBeginFlowNodeProps;

export class VirtualUnisonBeginNode extends VirtualNode<UnisonBeginRuntimeNode, undefined> {
    /** Reference pitch (A4) at which `detuneFreqDeviation` is applied 1:1. */
    private static readonly REF_FREQ = 440;

    private unisonNodes: CustomNode[] = [];
    private handleConnectedEdgesCb: (node: CustomNode, data: any, eventType: string) => void;
    private getVirtualEdges: (nodeId: string) => Edge[] | undefined;

    constructor(
        audioContext: AudioContext | undefined,
        eventBus: EventBus,
        node: UnisonBeginRuntimeNode,
        handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void,
        getVirtualEdges: (nodeId: string) => Edge[] | undefined
    ) {
        super(audioContext, undefined, eventBus, node);
        this.handleConnectedEdgesCb = handleConnectedEdges;
        this.getVirtualEdges = getVirtualEdges;
        this.subscribeEvents();
    }

    setUnisonNodes(nodes: CustomNode[]) {
        this.unisonNodes = nodes;
    }

    /**
     * Frequency-dependent detune amount in cents. Linear in Hz: the deviation
     * equals `detuneFreqDeviation` cents at the A440 reference and scales
     * proportionally with the incoming note frequency — higher notes detune
     * more, lower notes less. Returns 0 when no frequency is available.
     */
    private detuneCentsForFrequency(frequency: number): number {
        const dev = this.node.data.detuneFreqDeviation || 0;
        if (dev === 0 || !(frequency > 0)) return 0;
        return dev * (frequency / VirtualUnisonBeginNode.REF_FREQ);
    }

    private subscribeEvents() {
        this.eventBus.subscribe(
            `${this.node.id}.unison-input.receiveNodeOn`,
            this.handleNoteOn
        );
        this.eventBus.subscribe(
            `${this.node.id}.unison-input.receiveNodeOff`,
            this.handleNoteOff
        );
    }

    /** Resolve the voice-i clone id for an edge's target node. */
    private voiceTargetFor(target: string, voiceIndex: number): string {
        for (const orig of this.unisonNodes) {
            if (target === orig.id || target.startsWith(orig.id + '.')) {
                return (orig.id + '-' + voiceIndex) + target.slice(orig.id.length);
            }
        }
        return target;
    }

    private emitToVoice(voiceIndex: number, voiceData: any, eventType: 'receiveNodeOn' | 'receiveNodeOff') {
        const originalEdges = (this.getVirtualEdges(this.node.id) || [])
            .filter((e) => e.sourceHandle === 'unison-output');
        if (originalEdges.length === 0) {
            // Fallback: use the original routing (original FlowNode receives the event)
            this.handleConnectedEdgesCb(this.node as any, voiceData, eventType);
            return;
        }
        for (const edge of originalEdges) {
            const voiceTarget = this.voiceTargetFor(edge.target, voiceIndex);
            this.eventBus.emit(
                `${voiceTarget}.${edge.targetHandle}.${eventType}`,
                { ...voiceData, nodeId: voiceTarget, source: this.node.id }
            );
        }
    }

    /**
     * Emit the frequency-dependent detune (cents) to whatever the
     * `detune-output` handle is wired to. Sent as a normal value event on the
     * target handle — so it works with a standard FlowNode `input-N` pin
     * (the InputNode forwards the value on into the sub-flow).
     */
    private emitDetuneToVoice(voiceIndex: number, detune: number) {
        const detuneEdges = (this.getVirtualEdges(this.node.id) || [])
            .filter((e) => e.sourceHandle === 'detune-output');
        if (detuneEdges.length === 0) return;
        for (const edge of detuneEdges) {
            const voiceTarget = this.voiceTargetFor(edge.target, voiceIndex);
            this.eventBus.emit(
                `${voiceTarget}.${edge.targetHandle}.receiveNodeOn`,
                { value: detune, detune, nodeId: voiceTarget, source: this.node.id }
            );
        }
    }

    private handleNoteOn = (data: any) => {
        const n = Math.max(1, this.node.data.numberOfVoices || 1);
        const gainDeviation = this.node.data.gainDeviation || 0;
        const startDevMs = this.node.data.msTimeStartDeviation || 0;

        // Frequency-dependent detune (cents), linear in Hz relative to A440.
        // Computed from the incoming note — the same value for every voice,
        // since it tracks pitch rather than spreading voices apart.
        const freq = (typeof data.frequency === 'number' && data.frequency > 0) ? data.frequency : 0;
        const detuneInCents = this.detuneCentsForFrequency(freq);

        // When a `detune-output` is wired, the detune is delivered through that
        // handle — so don't also bake it into the frequency (would double up).
        const hasDetuneOutput = (this.getVirtualEdges(this.node.id) || [])
            .some((e) => e.sourceHandle === 'detune-output');

        for (let i = 0; i < n; i++) {
            const delay = Math.random() * startDevMs;
            const gain = 1 + (Math.random() * 2 - 1) * gainDeviation;

            const voiceData: any = { ...data };
            if (!hasDetuneOutput && freq > 0) {
                voiceData.frequency = freq * Math.pow(2, detuneInCents / 1200);
            }
            if (typeof voiceData.velocity === 'number') {
                voiceData.velocity = Math.max(0, Math.min(127, voiceData.velocity * gain));
            }

            const voiceIndex = i;
            const capturedData = voiceData;
            const emit = () => {
                this.emitDetuneToVoice(voiceIndex, detuneInCents);
                this.emitToVoice(voiceIndex, capturedData, 'receiveNodeOn');
            };
            if (delay > 0) {
                setTimeout(emit, delay);
            } else {
                emit();
            }
        }
    };

    private handleNoteOff = (data: any) => {
        const n = Math.max(1, this.node.data.numberOfVoices || 1);
        const endDevMs = this.node.data.msTimeEndDeviation || 0;

        for (let i = 0; i < n; i++) {
            const delay = Math.random() * endDevMs;
            const voiceIndex = i;
            const emit = () => this.emitToVoice(voiceIndex, data, 'receiveNodeOff');
            if (delay > 0) {
                setTimeout(emit, delay);
            } else {
                emit();
            }
        }
    };

    dispose() {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
    }
}

export default VirtualUnisonBeginNode;
