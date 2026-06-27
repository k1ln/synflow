import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { ConstantNodeProps } from "../nodes/ConstantFlowNode";

/**
 * VirtualConstantNode emits its value when triggered.
 */
export class VirtualConstantNode extends VirtualNode<CustomNode & ConstantNodeProps, undefined> {
    public value: any;
    handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & ConstantNodeProps,
        value: unknown = "",
        handleConnectedEdges: (
            node: CustomNode,
            data: any,
            eventType: string
        ) => void) {
        super(undefined, undefined, eventBus, node);
        this.value = value;
        this.handleConnectedEdges = handleConnectedEdges;
        this.render();
        // Subscribe to input even
    }

    render() {
        this.eventBus.unsubscribeAll(this.node.id + ".main-input.receiveNodeOn");
        this.eventBus.subscribe(
            this.node.id + ".main-input.receiveNodeOn",
            this.handleNodeOn
        );

        this.eventBus.unsubscribeAll(this.node.id + ".main-input.receiveNodeOff");
        this.eventBus.subscribe(
            this.node.id + ".main-input.receiveNodeOff",
            this.handleNodeOff
        );
    }

    handleUpdateParams(node: CustomNode & ConstantNodeProps, data: any) {
        super.handleUpdateParams(node, data);
        if (data?.data?.value !== undefined) {
            this.value = data.data.value;
        }
    }

    private handleNodeOn = () => {
        // Emit the value to connected nodes
        this.handleConnectedEdges(this.node, { value: this.value }, "receiveNodeOn");
    };

    private handleNodeOff = () => {
        // Emit the value to connected nodes
        this.handleConnectedEdges(this.node, { value: this.value }, "receiveNodeOff");
    };

    // Optionally, call this to clean up subscriptions if needed
    public dispose() {
        this.eventBus.unsubscribe(
            this.node.id + ".main-input.receiveNodeOn",
            this.handleReceiveNodeOn
        );
    }
}

export default VirtualConstantNode;