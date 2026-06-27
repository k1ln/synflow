import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { OutputNodeProps } from "../nodes/OutputNode";

/**
 * VirtualOutputNode receives values from connected nodes and can emit output events.
 * It listens for input events and updates its internal value.
 */
export class VirtualOutputNode extends VirtualNode<CustomNode & OutputNodeProps, undefined> {
    private value: any;
    private index: number;
    private handleReceiveOutput: (node: CustomNode, data: any, eventType: string) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & OutputNodeProps,
        handleReceiveOutput: (node: CustomNode, data: any, eventType: string) => void
    ) {
        super(undefined, undefined, eventBus, node);
        this.value = node.data.value;
        this.index = node.data.index;
        this.handleReceiveOutput = handleReceiveOutput;
        // Listen for input event
        this.eventBus.subscribe(
            `${this.node.id}.input.receiveNodeOn`,
            (data) => {
                // VirtualOutputNode received NodeOn event
                this.handleReceiveNodeOn(data);
            }
        );
        this.eventBus.subscribe(
            `${this.node.id}.input.receiveNodeOff`,
            (data) => {
                //console.log("VirtualOutputNode received NodeOff event", data);
                this.handleReceiveNodeOff(data);
            }
        );
        // Listen for parameter updates
        this.eventBus.subscribe(
            `${this.node.id}.params.updateParams`,
            this.handleUpdateParams
        );
    }

    handleReceiveNodeOn = (data: any) => {
        this.handleReceiveOutput(this.node, data, "receiveNodeOn");
    };

    handleReceiveNodeOff = (data: any) => {
        this.handleReceiveOutput(this.node, data, "receiveNodeOff");
    };
    

    handleUpdateParams = (params: any) => {
        // VirtualOutputNode received updateParams event
        if (params.data) {
            if ("value" in params.data) {
                this.value = params.data.value;
            }
            if (typeof params.data.index === "number") {
                this.index = params.data.index;
            }
        }
    };

    setValue(newValue: any) {
        this.value = newValue;
    }

    setIndex(newIndex: number) {
        this.index = newIndex;
    }

    getValue() {
        return this.value;
    }

    dispose() {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
    }
}

export default VirtualOutputNode;