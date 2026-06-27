import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";

/**
 * VirtualBlockingSwitchNode routes incoming signals to available outputs in a blocking manner.
 * It remembers the path for each signal source until a corresponding 'Off' signal is received.
 * Each nodeOn signal gets assigned to the next available output and nodeOff goes to the same output.
 */
export class VirtualBlockingSwitchNode extends VirtualNode<CustomNode, undefined> {
    private numOutputs: number;
    private sourceToOutputMap: Map<string, number> = new Map();
    private occupiedOutputs: Set<number> = new Set();
    handleSendNodeOnSwitch: (data: { activeOutput: number; }) => void = () => { };
    handleSendNodeOffSwitch: (data: { activeOutput: number; }) => void  = () => { };

    constructor(eventBus: EventBus, node: CustomNode) {
        super(undefined, undefined, eventBus, node);
        this.numOutputs = (node.data as any).numOutputs || 2;

        // Subscribe to additional events beyond the base class
        this.eventBus.subscribe(`${this.node.id}.input.receiveNodeOn`, this.handleNodeOn);
        this.eventBus.subscribe(`${this.node.id}.input.receiveNodeOff`, this.handleNodeOff);
        this.eventBus.subscribe(`${this.node.id}.reset-input.receiveNodeOn`, this.handleReset);
        
        this.handleNodeOn = this.handleNodeOn.bind(this);
        this.handleNodeOff = this.handleNodeOff.bind(this);
    }

    // Override the base class method
    handleUpdateParams(node: CustomNode, data: any) {
        super.handleUpdateParams(node, data);
        if (data && typeof data.numOutputs === 'number') {
            const newNumOutputs = Math.max(1, data.numOutputs);
            if (newNumOutputs !== this.numOutputs) {
                this.numOutputs = newNumOutputs;
                // Reset on resize to avoid invalid output indices
                this.handleReset();
            }
        }
    }

    setSendNodeOn(handleSendNodeEventSwitch: (data: { activeOutput: number; }) => void
    ) {
        this.eventBus.unsubscribeAll(this.node.id + ".input.sendNodeOn")
        this.handleSendNodeOnSwitch = handleSendNodeEventSwitch;
        this.eventBus.subscribe(
            this.node.id + ".input.sendNodeOn",
            this.handleSendNodeOnSwitch
        );
    }

    setSendNodeOff(handleSendNodeEventSwitch: (data: { activeOutput: number; }) => void
    ) {
        this.eventBus.unsubscribeAll(this.node.id + ".input.sendNodeOff")
        this.handleSendNodeOffSwitch = handleSendNodeEventSwitch;
        this.eventBus.subscribe(
            this.node.id + ".input.sendNodeOff",
            this.handleSendNodeOffSwitch
        );
    }

    private handleNodeOn = (data: any) => {
        const sourceId = data.source || data.nodeId || "unknown";
        // Check if this source already has an assigned output
        if (this.sourceToOutputMap.has(data.value)) {
            // Signal from this source is already active, ignore new nodeOn
            return;
        }

        // Check if all outputs are busy
        if (this.occupiedOutputs.size >= this.numOutputs) {
            // All outputs are busy, block the signal
            // All outputs busy, blocking signal
            return;
        }

        // Find the first available output
        let outputIndex = -1;
        for (let i = 0; i < this.numOutputs; i++) {
            
            if (!this.occupiedOutputs.has(i)) {
                outputIndex = i;
                break;
            }
        }

        if (outputIndex !== -1) {
            // Assign this source to the found output
            this.sourceToOutputMap.set(data.value, outputIndex);
            // occupiedOutputs logged
            this.occupiedOutputs.add(outputIndex);
            this.eventBus.emit(`${this.node.id}.input.sendNodeOn`, {
                ...data,
                activeOutput: outputIndex
            });
        }
        else {
            // No available outputs for source
        }
    };

    private handleNodeOff = (data: any) => {
        const sourceId = data.source || data.nodeId || "unknown";
        if (this.sourceToOutputMap.has(data.value)) {
            const outputIndex = this.sourceToOutputMap.get(data.value)!;

            // Emit the nodeOff signal to the same output that was used for nodeOn
            this.eventBus.emit(`${this.node.id}.input.sendNodeOff`, {
                ...data,
                activeOutput: outputIndex
            });

            // Free up the output for future use
            this.sourceToOutputMap.delete(data.value);
            // Occupied Outputs Before Delete
            this.occupiedOutputs.delete(outputIndex);
        } else {
            // No assigned output found for source nodeOff
        }
    };

    private handleReset = () => {
        // Send nodeOff to all currently occupied outputs before clearing
        this.sourceToOutputMap.forEach((outputIndex, value) => {
            const outputIndex2 = this.sourceToOutputMap.get(value);  
            const data = { value }; // Create a data object with the value
            this.eventBus.emit(`${this.node.id}.input.sendNodeOff`, {
                ...data,
                activeOutput: outputIndex2
            });
        });
        
        // Clear all assignments
        this.sourceToOutputMap.clear();
        // Occupied Outputs Before Clear
        this.occupiedOutputs.clear();
    };

    public getStatus() {
        return {
            numOutputs: this.numOutputs,
            occupiedOutputs: Array.from(this.occupiedOutputs),
            sourceAssignments: Object.fromEntries(this.sourceToOutputMap)
        };
    }

    public dispose() {
        this.eventBus.unsubscribe(`${this.node.id}.input.receiveNodeOn`, this.handleNodeOn);
        this.eventBus.unsubscribe(`${this.node.id}.input.receiveNodeOff`, this.handleNodeOff);
        this.eventBus.unsubscribe(`${this.node.id}.reset-input.receiveNodeOn`, this.handleReset);
    }
}

export default VirtualBlockingSwitchNode;
