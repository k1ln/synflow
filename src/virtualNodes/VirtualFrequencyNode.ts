import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { FrequencyFlowNodeProps } from "../nodes/FrequencyFlowNode";

/**
 * VirtualFrequencyNode handles frequency value and emits it on input events.
 */
export class VirtualFrequencyNode extends VirtualNode<CustomNode & FrequencyFlowNodeProps, undefined> {
    private frequency: number;
    private frequencyType: "midi" | "hz" | "lfo";
    private knobValue: number;
    private handleConnectedEdges: (node: CustomNode, data:unknown,eventType:string) => void;

    constructor(
        eventBus: EventBus, 
        node: CustomNode & FrequencyFlowNodeProps, 
        frequency: number = 440, 
        frequencyType: "midi" | "hz" | "lfo" = "hz", 
        knobValue: number = 0,
        handleConnectedEdges: (node: CustomNode, data:unknown,eventType:string) => void = () => { /* Default no-op */ }
    ) {
        super(undefined, undefined, eventBus, node);
        this.frequency = frequency;
        this.frequencyType = frequencyType;
        this.knobValue = knobValue;
        
        this.handleConnectedEdges = handleConnectedEdges;
        // Subscribe to input event
        this.eventBus.subscribe(
            this.node.id + ".main-input.receiveNodeOn",
            this.handleReceiveNodeOn.bind(this)
        );
        this.subscribeParams();
    }

    subscribeParams() {
        this.eventBus.subscribe(
            `${this.node.id}.params.updateParams`,
            this.handleUpdateParams
        );
    }

    handleReceiveNodeOn = () => {
        // Emit the current frequency (and raw knob value) to connected nodes
        // Provide a "value" field because downstream logic expects data.value
        this.handleConnectedEdges(
            this.node,
            {
                value: this.frequency, // primary numeric value used by handleConnectedEdges()
                frequency: this.frequency,
                frequencyType: this.frequencyType,
                knobValue: this.knobValue,
            },
            "receiveNodeOn"
        );
    };

    handleUpdateParams = (params: any) => {
        // VirtualFrequencyNode handleUpdateParams
        if (params.data) {
            if (typeof params.data.frequency === "number") {
                this.frequency = params.data.frequency;
            }
            if (typeof params.data.knobValue === "number") {
                this.knobValue = params.data.knobValue;
            }
            if (typeof params.data.frequencyType === "string") {
                this.frequencyType = params.data.frequencyType as "midi" | "hz" | "lfo";
            }
        }
        this.handleReceiveNodeOn();
    };

    setFrequency(value: number) {
        this.frequency = value;
    }

    setKnobValue(value: number) {
        this.knobValue = value;
    }

    setFrequencyType(type: "midi" | "hz" | "lfo") {
        this.frequencyType = type;
    }

    getFrequency() {
        return this.frequency;
    }

    dispose() {
        this.eventBus.unsubscribe(
            this.node.id + ".main-input.receiveNodeOn",
            this.handleReceiveNodeOn
        );
        this.eventBus.unsubscribe(
            this.node.id + ".params.updateParams",
            this.handleUpdateParams
        );
    }
}

export default VirtualFrequencyNode;