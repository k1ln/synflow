import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { SwitchFlowNodeProps } from "../nodes/SwitchFlowNode";

/**
 * VirtualSwitchNode handles switching between multiple outputs.
 * It listens for "main-input.receiveNodeOn" and emits "main-input.sendNodeOn" with the active output index.
 */
export class VirtualSwitchNode extends VirtualNode<CustomNode & SwitchFlowNodeProps, undefined> {
    private numOutputs: number;
    private activeOutput: number;
    private lastOutput: number;
    private handleSendNodeOnSwitch?: (data: { activeOutput: number }) => void;
    private handleSendNodeOffSwitch?: (data: { activeOutput: number }) => void;

    constructor(eventBus: EventBus, node: CustomNode & SwitchFlowNodeProps, numOutputs: number = 2, activeOutput: number = 0) {
        super(undefined, undefined as any, eventBus, node);
        this.numOutputs = Math.max(1, node.data.numOutputs);
        this.activeOutput = Math.min(Math.max(0, node.data.activeOutput), this.numOutputs - 1);
        this.lastOutput = this.activeOutput;

        // Subscribe immediately (no implicit render side-effect)
        this.eventBus.subscribe(this.node.id + ".main-input.receiveNodeOn", this.handleNodeOn);
        this.eventBus.subscribe(this.node.id + ".reset-input.receiveNodeOn", this.handleReset);
    }

    private handleNodeOn = (_data?: any) => {
        const current = this.activeOutput;
        this.lastOutput = current;
        this.activeOutput = current + 1;
        if (this.activeOutput >= this.numOutputs) this.activeOutput = 0;
        (this.node as any).data.activeOutput = this.activeOutput;
        this.emitActiveOutput("sendNodeOn", this.activeOutput);
        
    };

    private handleReset = () => {
        this.activeOutput = 0;
        (this.node as any).data.activeOutput = 0;
    };

    public setNumOutputs(n: number) {
        const newCount = Math.max(1, n);
        if (newCount !== this.numOutputs) {
            this.numOutputs = newCount;
            if (this.activeOutput >= this.numOutputs) this.activeOutput = 0;
            (this.node as any).data.activeOutput = this.activeOutput;
        }
    }

    public setActiveOutput(index: number) {
        if (!Number.isFinite(index)) return;
        const clamped = Math.min(Math.max(0, Math.floor(index)), this.numOutputs - 1);
        this.activeOutput = clamped;
    (this.node as any).data.activeOutput = clamped;
    }

    private emitActiveOutput(kind: 'sendNodeOn' | 'sendNodeOff', index: number) {
        const path = `${this.node.id}.main-input.${kind}`;
        const payload = { activeOutput: index };
        this.eventBus.emit(path, payload);
    }

    // Optional UI integration if something calls render again
    render() {
        // Only ensure subscriptions exist (avoid nuking other listeners)
        this.eventBus.unsubscribe(this.node.id + ".main-input.receiveNodeOn", this.handleNodeOn);
        this.eventBus.unsubscribe(this.node.id + ".reset-input.receiveNodeOn", this.handleReset);
        this.eventBus.subscribe(this.node.id + ".main-input.receiveNodeOn", this.handleNodeOn);
        this.eventBus.subscribe(this.node.id + ".reset-input.receiveNodeOn", this.handleReset);
    }

    setSendNodeOn(handler: (data: { activeOutput: number }) => void) {
        this.eventBus.unsubscribe(this.node.id + ".main-input.sendNodeOn", this.handleSendNodeOnSwitch as any);
        this.handleSendNodeOnSwitch = handler;
        this.eventBus.subscribe(this.node.id + ".main-input.sendNodeOn", handler);
    }

    public dispose() {
        this.eventBus.unsubscribe(this.node.id + ".main-input.receiveNodeOn", this.handleNodeOn);
        this.eventBus.unsubscribe(this.node.id + ".reset-input.receiveNodeOn", this.handleReset);
        if (this.handleSendNodeOnSwitch) this.eventBus.unsubscribe(this.node.id + ".main-input.sendNodeOn", this.handleSendNodeOnSwitch);
    }
}

export default VirtualSwitchNode;