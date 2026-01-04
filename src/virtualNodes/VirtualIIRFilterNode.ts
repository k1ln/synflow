import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { IIRFilterFlowNodeProps } from "../nodes/IIRFilterFlowNode";

/**
 * VirtualIIRFilterNode wraps a Web Audio IIRFilterNode.
 * It listens for param update events: <nodeId>.params.updateParams with data.feedforward / data.feedback arrays.
 */
export class VirtualIIRFilterNode extends VirtualNode<CustomNode & IIRFilterFlowNodeProps, IIRFilterNode> {
  private feedforward: number[];
  private feedback: number[];
  private resetConnectionsOfNode: (nodeId: string) => void;
  constructor(
    audioContext: AudioContext, 
    eventBus: EventBus, 
    node: CustomNode & IIRFilterFlowNodeProps,
    resetConnectionsOfNode: (nodeId: string) => void
  ) {
    const ff = (node.data.feedforward && node.data.feedforward.length) ? node.data.feedforward : [0.5, 0.5];
    const fb = (node.data.feedback && node.data.feedback.length) ? node.data.feedback : [1.0, -0.5];
    const iir = audioContext.createIIRFilter(ff, fb);
    super(audioContext, iir, eventBus, node);
    this.feedforward = ff;
    this.feedback = fb;
    this.resetConnectionsOfNode = resetConnectionsOfNode;
    // Listen for coefficient update requests
    this.eventBus.subscribe(`${this.node.id}.params.updateParams`, this.handleUpdateParams);
  }

  updateCoefficients(feedforward: number[], feedback: number[]) {
    try {
      // Recreate node because Web Audio API doesn't let you change coefficients after creation.
      const newNode = this.audioContext!.createIIRFilter(feedforward, feedback);
      // Rewire existing connections if any (simple approach: disconnect old, replace reference)
      (this.audioNode as any)?.disconnect?.();
      this.audioNode = newNode;
      this.feedforward = feedforward;
      this.feedback = feedback;
      this.resetConnectionsOfNode(this.node.id);
    } catch (e) {
      
      console.warn("Failed updating IIR coefficients", e);
    }
  }

  handleUpdateParams = (payload: any) => {
    if (!payload?.data) return;
    const d = payload.data;
    let ff = this.feedforward;
    let fb = this.feedback;
  if (Array.isArray(d.feedforward)) ff = d.feedforward.map((v: any) => Number(v)).filter((n: number) => !isNaN(n));
  if (Array.isArray(d.feedback)) fb = d.feedback.map((v: any) => Number(v)).filter((n: number) => !isNaN(n));
    if (ff !== this.feedforward || fb !== this.feedback) {
      this.updateCoefficients(ff, fb);
    }
  };

  dispose() {
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
    (this.audioNode as any)?.disconnect?.();
  }
}

export default VirtualIIRFilterNode;