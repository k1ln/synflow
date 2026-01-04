import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus, { EventCallback } from "../sys/EventBus";
import { ADSRFlowNodeProps } from "../nodes/ADSRFlowNode";

/**
 * VirtualADSRNode emits nodeOn/nodeOff events with ADSR envelope parameters.
 * It listens for main-input.receiveNodeOn and main-input.receiveNodeOff events.
 */
export class VirtualADSRNode extends VirtualNode<CustomNode & ADSRFlowNodeProps, undefined> {
    private attackTime: number;
    private sustainTime: number;
    private sustainLevel: number;
    private releaseTime: number;
    private minPercent: number; // -1000..1000 default 0
    private maxPercent: number; // -1000..1000 default 100
    private isOn: boolean = false;
    private handleConnectedEdgesADSRNodeOn: (node: CustomNode, data: any, eventType: string) => void;
    private handleConnectedEdgesADSRNodeOff: (node: CustomNode, data: any, eventType: string) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & ADSRFlowNodeProps,
        handleConnectedEdgesADSRNodeOff: (node: CustomNode, data: any, eventType: string) => void,
        handleConnectedEdgesADSRNodeOn: (node: CustomNode, data: any, eventType: string) => void
    ) {
        super(undefined, undefined, eventBus, node);

        // Initialize from node data
        const data = node.data;
    this.attackTime = data.attackTime ?? 0.1;
        this.sustainTime = data.sustainTime ?? 0.5;
        this.sustainLevel = data.sustainLevel ?? 0.7;
        this.releaseTime = data.releaseTime ?? 0.3;
    this.minPercent = typeof (data as any).minPercent === 'number' ? (data as any).minPercent : 0;
    this.maxPercent = typeof (data as any).maxPercent === 'number' ? (data as any).maxPercent : 100;
        this.handleConnectedEdgesADSRNodeOff = handleConnectedEdgesADSRNodeOff;
        this.handleConnectedEdgesADSRNodeOn = handleConnectedEdgesADSRNodeOn;
        this.handleConnectedEdgesADSRNodeOn = this.handleConnectedEdgesADSRNodeOn.bind(this);
        this.handleConnectedEdgesADSRNodeOff = this.handleConnectedEdgesADSRNodeOff.bind(this)

        // Listen for param updates
        this.eventBus.subscribe(
            `${this.node.id}.params.updateParams`,
            (params: ADSRFlowNodeProps) => {
                if (params.data) {
                    this.attackTime = params.data.attackTime;
                    (this.node.data as any).attackTime = this.attackTime;
                    this.sustainTime = params.data.sustainTime;
                    (this.node.data as any).sustainTime = this.sustainTime;
                    this.sustainLevel = params.data.sustainLevel;
                    (this.node.data as any).sustainLevel = this.sustainLevel;
                    this.releaseTime = params.data.releaseTime;
                    (this.node.data as any).releaseTime = this.releaseTime;
                    if (typeof params.data.minPercent === 'number') { this.minPercent = params.data.minPercent; (this.node.data as any).minPercent = this.minPercent; }
                    if (typeof params.data.maxPercent === 'number') { this.maxPercent = params.data.maxPercent; (this.node.data as any).maxPercent = this.maxPercent; }
                }
            }
        );
        
        this.eventBus.subscribe(
            node.id + ".main-input.receiveNodeOn",
            (data) => {
                //console.log("VirtualADSRNode received main-input.receiveNodeOn", data);
                // check when releasing 
                if(this.isOn) {
                    this.handleConnectedEdgesADSRNodeOff(this.node, { ...data, minPercent: this.minPercent, maxPercent: this.maxPercent }, "receiveNodeOn");// Already on, ignore    
                }
                this.isOn = true;
                this.handleConnectedEdgesADSRNodeOn(this.node, { ...data, minPercent: this.minPercent, maxPercent: this.maxPercent }, "receiveNodeOn");
            }
        );
        this.eventBus.subscribe(
            node.id + ".main-input.receiveNodeOff",
            (data) => {
                this.handleConnectedEdgesADSRNodeOff(this.node, { ...data, minPercent: this.minPercent, maxPercent: this.maxPercent }, "receiveNodeOff");
                this.isOn = false;
            }
        );

        // Additional parameter input handle subscriptions
        this.eventBus.subscribe(
            node.id + ".attack-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.attackTime = payload.value;
                    (this.node.data as any).attackTime = this.attackTime;
                }
            }
        );
        this.eventBus.subscribe(
            node.id + ".sustainTime-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.sustainTime = payload.value;
                    (this.node.data as any).sustainTime = this.sustainTime;
                }
            }
        );
        this.eventBus.subscribe(
            node.id + ".sustainLevel-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.sustainLevel = payload.value;
                    (this.node.data as any).sustainLevel = this.sustainLevel;
                }
            }
        );
        this.eventBus.subscribe(
            node.id + ".release-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.releaseTime = payload.value;
                    (this.node.data as any).releaseTime = this.releaseTime;
                }
            }
        );
        this.eventBus.subscribe(
            node.id + ".minPercent-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.minPercent = payload.value;
                    (this.node.data as any).minPercent = this.minPercent;
                }
            }
        );
        this.eventBus.subscribe(
            node.id + ".maxPercent-input.receiveNodeOn",
            (payload:any) => {
                if(typeof payload.value === 'number'){
                    this.maxPercent = payload.value;
                    (this.node.data as any).maxPercent = this.maxPercent;
                }
            }
        );
    }

    private handleNodeOn = (data: any) => {
        // Emit nodeOn with ADSR parameters
        this.handleConnectedEdgesADSRNodeOn(this.node, {
            ...data,
        }, 'receiveNodeOn');
    };

    private handleNodeOff = (data: any) => {
        // Emit nodeOff with releaseTime
        this.handleConnectedEdgesADSRNodeOff(this.node, {
            ...data,
            releaseTime: this.releaseTime
        }, 'receiveNodeOff');
    };

    dispose() {
        this.eventBus.unsubscribeAllByNodeId(`${this.node.id}`);
    }
}

export default VirtualADSRNode;