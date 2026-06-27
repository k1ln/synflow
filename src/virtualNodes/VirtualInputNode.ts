import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { InputNodeProps } from "../nodes/InputNode";

/**
 * VirtualInputNode emits its value when triggered.
 * It listens for main-input.receiveNodeOn and emits main-input.sendNodeOn with the current value.
 */
export class VirtualInputNode extends VirtualNode<CustomNode & InputNodeProps, undefined> {
    private value: any;
    private index: number;
    handleConnectedEdges?: (node: CustomNode, data: any, eventType: string) => void = undefined; 

    constructor(
        eventBus: EventBus,
        node: CustomNode & InputNodeProps,
        handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void
    ) {
        super(undefined, undefined, eventBus, node);
        this.value = node.data.value;
        this.index = node.data.index;
        this.handleConnectedEdges = handleConnectedEdges;
        this.handleUpdateParams = this.handleUpdateParams.bind(this);
        
        // Listen for input event
        this.subscribeAllEvents();
    }

    private subscribeAllEvents() {
        
        this.eventBus.subscribe(
                this.node.id + "input-" + this.index + ".receiveNodeOn",
                (data) => {
                    //console.log("Input Event received");
                    this.handleConnectedEdges!(this.node, data, "receiveNodeOn");
                }
            );
            this.eventBus.subscribe(
                this.node.id + "input-" + this.index + ".receiveNodeOff",
                (data) => this.handleConnectedEdges!(this.node, data, "receiveNodeOff")
            );
        
        this.eventBus.subscribe(
            this.node.id + ".params.updateParams",
            this.handleUpdateParams
        );
    }

    

    handleUpdateParams = (params: any) => {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
        this.subscribeAllEvents();
    };

    dispose() {
        this.eventBus.unsubscribeAllByNodeId(this.node.id);
    }
}

export default VirtualInputNode;