import VirtualNode from "./VirtualNode";
import { CustomNode, VirtualNodeType } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { FlowNodeProps } from "../nodes/FlowNode";

/**
 * VirtualFlowNode acts as a wrapper for user-defined flow nodes.
 * It listens for input events and emits events to connected nodes.
 * You can extend this to load and execute custom flow logic from IndexedDB or elsewhere.
 */
export class VirtualFlowNode extends VirtualNode<CustomNode & FlowNodeProps, undefined> {
    private selectedNode?: string;
    private numberOfInputs: number = 0;
    private numberOfOutputs: number = 0;
    private virtualNodes?: Map<
        string,
        VirtualNodeType
    >; // Reference to all virtual nodes in the graph, for potential internal routing
    private customNode: CustomNode | undefined; // Placeholder for custom node logic/state
    private handleConnectedEdgesFromOutput: (node: CustomNode, outputIndex: number, data: any, eventType: string) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & FlowNodeProps,
        handleConnectedEdgesFromOutput: (node: CustomNode, outputIndex: number, data: any, eventType: string) => void,
        customNode?: CustomNode,
        virtualNodes?: Map<
            string,
            VirtualNodeType
        >
    ) {
        //Love this
        super(undefined, undefined, eventBus, node);
        this.customNode = customNode;
        this.selectedNode = node.data.selectedNode;
        this.handleConnectedEdgesFromOutput = handleConnectedEdgesFromOutput;
        this.virtualNodes = virtualNodes;
        // Listen for main input event and forward to outputs
        this.subscribeAllEvents();

        // Listen for parameter updates (e.g., selectedNode, inputs, outputs
    }

    subscribeAllEvents() {
        this.eventBus.subscribe(
            `${this.node.id}.main-input.receiveNodeOn`,
            this.handleReceiveNodeOn
        );

        this.eventBus.subscribe(
            `${this.node.id}.customNode.updateParams`,
            this.handleUpdateParams
        );
        const outputs: any[] = Array.isArray(this.node.data.outputArr) ? this.node.data.outputArr : [];
        const inputs: any[] = Array.isArray(this.node.data.inputArr) ? this.node.data.inputArr : [];

        // Subscribe to output events (already existing behavior)
        for (let index = 0; index < outputs.length; index++) {
            this.eventBus.subscribe(
                `${this.node.id}.output-${outputs[index]}.receiveNodeOn`,
                (data) => {
                    this.handleConnectedEdgesFromOutput(this.node, index, data, 'receiveNodeOn');
                }
            );
            this.eventBus.subscribe(
                `${this.node.id}.output-${outputs[index]}.receiveNodeOff`,
                (data) => {
                    this.handleConnectedEdgesFromOutput(this.node, index, data, 'receiveNodeOff');
                }
            );
        }

        // Subscribe to input events so custom parent can react or transform.
        // When an input receives data we forward it to all outputs (mirroring main-input behavior).
        for (let i = 0; i < inputs.length; i++) {
            const idx = inputs[i];
            const inputNodeInCustomNode = (this.customNode as any)?.nodes?.find((n: any) => n.type === 'InputNode' && n.data?.index === idx);
            if (!inputNodeInCustomNode) continue;
            // Subscribe external input events and forward internally. Internal InputNode virtual listens on `${id}input-X...` (without dot before input)
            this.eventBus.subscribe(
                `${this.node.id}.input-${idx}.receiveNodeOn`,
                (data) => {
                    this.eventBus.emit(`${inputNodeInCustomNode.id}input-${idx}.receiveNodeOn`, data);
                }
            );
            this.eventBus.subscribe(
                `${this.node.id}.input-${idx}.receiveNodeOff`,
                (data) => {
                    this.eventBus.emit(`${inputNodeInCustomNode.id}input-${idx}.receiveNodeOff`, data);
                }
            );
        }
    }

    private forwardToInputInCustomNode(data: any, event: 'receiveNodeOn' | 'receiveNodeOff' = 'receiveNodeOn') {
        const inputs: any[] = Array.isArray(this.node.data.inputArr) ? this.node.data.inputArr : [];

        for (let i = 0; i < inputs.length; i++) {
            this.eventBus.emit(`${this.node.id}.input-${inputs[i]}.${event}`, data);
        }
    }

    handleReceiveNodeOn = (data: any) => {
        this.forwardToInputInCustomNode(data, 'receiveNodeOn');
    };

    handleUpdateParams = (params: any) => {
        if (params.data) {
            if (typeof params.data.selectedNode === "string") {
                this.selectedNode = params.data.selectedNode;
            }
            this.eventBus.unsubscribeAllByNodeId(this.node.id);
            this.subscribeAllEvents();
        }
    };



    dispose() {
        // Unsubscribe from all events related to this node
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
    }
}

export default VirtualFlowNode;