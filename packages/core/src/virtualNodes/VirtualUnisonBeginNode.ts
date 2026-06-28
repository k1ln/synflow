import { SynEdge as Edge } from "../types";
import VirtualNode from "./VirtualNode";
import EventBus from "../EventBus";
import { CustomNode } from "../AudioGraphManager";
import { UnsisonBeginFlowNodeProps } from "../nodeData";

type UnisonBeginRuntimeNode = CustomNode & UnsisonBeginFlowNodeProps;

export class VirtualUnisonBeginNode extends VirtualNode<UnisonBeginRuntimeNode, undefined> {
    /** Reference pitch (A4) at which `detuneFreqDeviation` is applied 1:1. */
    private static readonly REF_FREQ = 440;

    private unisonNodes: CustomNode[] = [];
    private handleConnectedEdgesCb: (node: CustomNode, data: any, eventType: string) => void;
    private getVirtualEdges: (nodeId: string) => Edge[] | undefined;

    /**
     * Per-voice spread factors in [-1, 1] (evenly distributed with light
     * jitter). Each voice keeps its own value so the detuning is stable across
     * notes (a consistent fat unison rather than pitch that warbles every
     * keypress). Regenerated only when the voice count changes.
     */
    private voiceDetuneFactors: number[] = [];

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
     * Maximum detune spread (in cents) for a given note. This is the ± bound
     * that the per-voice random factors are scaled by. Linear in Hz: equals
     * `detuneFreqDeviation` cents at the A440 reference and scales
     * proportionally with the incoming note frequency — higher notes spread
     * wider, lower notes tighter. Returns 0 when no frequency is available.
     */
    private detuneSpreadForFrequency(frequency: number): number {
        const dev = this.node.data.detuneFreqDeviation || 0;
        if (dev === 0 || !(frequency > 0)) return 0;
        return dev * (frequency / VirtualUnisonBeginNode.REF_FREQ);
    }

    /**
     * Spread factors in [-1, 1], one per voice. Voices are distributed evenly
     * across the range (symmetric around 0, so no overall pitch shift) with a
     * little random jitter so the unison isn't perfectly rigid. A single voice
     * is always centred (factor 0) so unison-of-1 stays in tune. Cached and
     * only regenerated when the voice count changes, keeping each voice's
     * detune stable from note to note.
     */
    private detuneFactorsFor(n: number): number[] {
        if (this.voiceDetuneFactors.length !== n) {
            if (n === 1) {
                this.voiceDetuneFactors = [0];
            } else {
                const spacing = 2 / (n - 1);     // gap between adjacent voice slots
                const jitter = spacing * 0.25;   // stay close to the even slot
                this.voiceDetuneFactors = Array.from({ length: n }, (_, i) => {
                    const base = (i / (n - 1)) * 2 - 1;            // -1 .. +1, evenly spaced
                    const f = base + (Math.random() * 2 - 1) * jitter;
                    return Math.max(-1, Math.min(1, f));
                });
            }
        }
        return this.voiceDetuneFactors;
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
            // A WebAudio AudioParam handle (e.g. an Oscillator/Filter `detune`
            // pin) only consumes values through `params.updateParams`; those
            // nodes never subscribe to `<handle>.receiveNodeOn`. Emit that too
            // so a detune-output wired straight to an AudioParam actually moves
            // it (same routing every other source in AudioGraphManager uses).
            this.eventBus.emit(
                `${voiceTarget}.params.updateParams`,
                {
                    nodeId: voiceTarget,
                    source: this.node.id,
                    data: { [edge.targetHandle as string]: detune },
                }
            );
            // Plain value event for the standard FlowNode `input-N` pin case,
            // which forwards the detune on into the sub-flow.
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

        // Max detune spread (cents) for this note, linear in Hz relative to
        // A440. Each voice takes a fixed random fraction of this, so the voices
        // are spread apart rather than all sharing one offset.
        const freq = (typeof data.frequency === 'number' && data.frequency > 0) ? data.frequency : 0;
        const detuneSpread = this.detuneSpreadForFrequency(freq);
        const factors = this.detuneFactorsFor(n);

        // When a `detune-output` is wired, the detune is delivered through that
        // handle — so don't also bake it into the frequency (would double up).
        const hasDetuneOutput = (this.getVirtualEdges(this.node.id) || [])
            .some((e) => e.sourceHandle === 'detune-output');

        for (let i = 0; i < n; i++) {
            const delay = Math.random() * startDevMs;
            const gain = 1 + (Math.random() * 2 - 1) * gainDeviation;
            // Per-voice random detune (cents), fixed for this voice.
            const voiceDetune = detuneSpread * factors[i];

            const voiceData: any = { ...data };
            if (!hasDetuneOutput && freq > 0) {
                voiceData.frequency = freq * Math.pow(2, voiceDetune / 1200);
            }
            if (typeof voiceData.velocity === 'number') {
                voiceData.velocity = Math.max(0, Math.min(127, voiceData.velocity * gain));
            }

            const voiceIndex = i;
            const capturedData = voiceData;
            const capturedDetune = voiceDetune;
            const emit = () => {
                this.emitDetuneToVoice(voiceIndex, capturedDetune);
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
