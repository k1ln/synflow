import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { DelayFlowNodeProps } from "../nodes/DelayFlowNode";

// VirtualDelayNode expects incoming delayTime values in MILLISECONDS from the flow node
// and converts them to seconds for the underlying Web Audio DelayNode.
export class VirtualDelayNode extends VirtualNode<CustomNode & DelayFlowNodeProps> {
    private readonly MAX_SECONDS = 30; // internal buffer size

    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & DelayFlowNodeProps) {
        // Allocate a larger internal buffer (30s) so delayTime can be modulated widely later.
        super(
            audioContext,
            audioContext.createDelay(30),
            eventBus,
            node
        );
    }

    // Override param handling to ensure ms->seconds conversion for delayTime updates
    handleUpdateParams(node: CustomNode & DelayFlowNodeProps, data: any) {
        if (!data || !data.data) return;
        if (!this.audioNode) return;
        const delayNode = this.audioNode as unknown as DelayNode;
        Object.keys(data.data).forEach((key) => {
            if (key === 'delayTime') {
                let incoming = data.data[key];
                let num = incoming * 1;
                if (typeof num === 'number' && !isNaN(num)) {
                    // Treat value as milliseconds
                    const seconds = Math.min(this.MAX_SECONDS, Math.max(0, num / 1000));
                    try {
                        delayNode.delayTime.value = seconds;
                    } catch (e) {
                        console.warn('[VirtualDelayNode] Failed setting delayTime', num, e);
                    }
                }
                // Mirror into node.data for state persistence
                (node.data as any).delayTime = num;
            } else {
                // Delegate other params to base handler
                super.handleUpdateParams(node, { data: { [key]: data.data[key] } });
            }
        });
    }

    render(delayTimeMs: number = 500) {
        const delayNode = this.audioNode as unknown as DelayNode;
        if (!delayNode) return;
        // Convert ms to seconds and clamp
        const seconds = Math.min(this.MAX_SECONDS, Math.max(0, delayTimeMs / 1000));
        try {
            delayNode.delayTime.value = seconds;
        } catch (e) {
            console.warn('[VirtualDelayNode] initial render set failed', delayTimeMs, e);
        }
    }
}

export default VirtualDelayNode;