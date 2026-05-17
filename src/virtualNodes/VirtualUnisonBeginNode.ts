import { Edge } from "@xyflow/react";
import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import { UnsisonBeginFlowNodeProps } from "../nodes/UnisonBeginFlowNode";

type UnisonBeginRuntimeNode = CustomNode & UnsisonBeginFlowNodeProps;

export class VirtualUnisonBeginNode extends VirtualNode<UnisonBeginRuntimeNode, undefined> {
    private unisonNodes: CustomNode[] = [];
    private voiceDetunes: number[] = [];
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
        this.computeVoiceDetunes();
        this.subscribeEvents();
    }

    setUnisonNodes(nodes: CustomNode[]) {
        this.unisonNodes = nodes;
    }

    private computeVoiceDetunes() {
        const n = Math.max(1, this.node.data.numberOfVoices || 1);
        const deviation = this.node.data.detuneCentsDeviation || 0;
        this.voiceDetunes = [];
        if (n === 1) {
            this.voiceDetunes.push(0);
        } else {
            for (let i = 0; i < n; i++) {
                this.voiceDetunes.push(deviation * (2 * i / (n - 1) - 1));
            }
        }
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

    handleUpdateParams(node: UnisonBeginRuntimeNode, data: any) {
        super.handleUpdateParams(node, data);
        const d = data?.data;
        if (d && (d.numberOfVoices !== undefined || d.detuneCentsDeviation !== undefined)) {
            this.computeVoiceDetunes();
        }
    }

    private emitToVoice(voiceIndex: number, voiceData: any, eventType: 'receiveNodeOn' | 'receiveNodeOff') {
        const originalEdges = this.getVirtualEdges(this.node.id) || [];
        if (originalEdges.length === 0) {
            // Fallback: use the original routing (original FlowNode receives the event)
            this.handleConnectedEdgesCb(this.node as any, voiceData, eventType);
            return;
        }
        for (const edge of originalEdges) {
            // Derive the voice-i clone target from the original edge target
            let voiceTarget = edge.target;
            for (const orig of this.unisonNodes) {
                if (edge.target === orig.id || edge.target.startsWith(orig.id + '.')) {
                    voiceTarget = (orig.id + '-' + voiceIndex) + edge.target.slice(orig.id.length);
                    break;
                }
            }
            this.eventBus.emit(
                `${voiceTarget}.${edge.targetHandle}.${eventType}`,
                { ...voiceData, nodeId: voiceTarget, source: this.node.id }
            );
        }
    }

    private handleNoteOn = (data: any) => {
        const n = Math.max(1, this.node.data.numberOfVoices || 1);
        const gainDeviation = this.node.data.gainDeviation || 0;
        const startDevMs = this.node.data.msTimeStartDeviation || 0;

        for (let i = 0; i < n; i++) {
            const delay = Math.random() * startDevMs;
            const gain = 1 + (Math.random() * 2 - 1) * gainDeviation;
            const detuneInCents = this.voiceDetunes[i];

            const voiceData: any = { ...data };
            if (typeof voiceData.frequency === 'number' && voiceData.frequency > 0) {
                voiceData.frequency = voiceData.frequency * Math.pow(2, detuneInCents / 1200);
            }
            if (typeof voiceData.velocity === 'number') {
                voiceData.velocity = Math.max(0, Math.min(127, voiceData.velocity * gain));
            }

            const voiceIndex = i;
            const capturedData = voiceData;
            const emit = () => this.emitToVoice(voiceIndex, capturedData, 'receiveNodeOn');
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
