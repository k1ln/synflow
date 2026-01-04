import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { FunctionNodeProps } from "../nodes/FunctionFlowNode";

/**
 * VirtualFunctionNode evaluates a user-defined function when triggered.
 * It listens for main-input and additional input events, manages input values,
 * and emits the result on main-input.sendNodeOn.
 */
export class VirtualFunctionNode extends VirtualNode<CustomNode & FunctionNodeProps, undefined> {
    private functionCode: string;
    private numInputs: number;
    private inputDefaults: string[];
    private inputValues: string[];
    private outputValue: any;
    private handleConnectedEdges: (node: CustomNode, data: unknown, eventType: string, index: number | null) => void;

    constructor(
        eventBus: EventBus,
        node: CustomNode & FunctionNodeProps,
        handleConnectedEdges: (node: CustomNode, data: unknown, eventType: string, index: number | null) => void
    ) {
        super(undefined, undefined, eventBus, node);
        const data = node.data;
        this.functionCode = data.functionCode;
        this.numInputs = data.numInputs!;
        this.inputDefaults = data.inputDefaults!.length ? data.inputDefaults! : Array(data.numInputs).fill("") as string [];
        this.inputValues = [...this.inputDefaults];
        this.outputValue = "";
        this.handleConnectedEdges = handleConnectedEdges;

        // Subscribe to additional input signals (do not trigger output)
        for (let i = 0; i < this.numInputs; i++) {
            this.eventBus.subscribe(
                `${this.node.id}.input-${i}.receiveNodeOn`,
                (inputData: any) => {
                    this.inputValues[i] = inputData?.value ?? this.inputDefaults[i] ?? "";
                }
            );
        }

        this.eventBus.subscribe(
            `${this.node.id}.params.updateParams`,
            (params: any) => {
                if (params.data) {
                    if (typeof params.data.functionCode === "string") {
                        this.setFunctionCode(params.data.functionCode);
                    }
                    if (typeof params.data.numInputs === "number") {
                        this.setNumInputs(params.data.numInputs);
                    }
                    if (Array.isArray(params.data.inputDefaults)) {
                        this.setInputDefaults(params.data.inputDefaults);
                    }
                }
            }
        );

        // Subscribe to main input (triggers function evaluation)
        this.eventBus.subscribe(
            `${this.node.id}.main-input.receiveNodeOn`,
            (inputData: any) => {
                //console.log("VirtualFunctionNode received NodeOn event Inner", inputData);
                const mainValue = inputData?.value ?? "";
                //console.log("EVALUATE FUNCTION", this.node.id, mainValue);
                this.evaluateFunction(mainValue, "receiveNodeOn");
            }
        );

        this.eventBus.subscribe(
            `${this.node.id}.main-input.receiveNodeOff`,
            (inputData: any) => {
                //console.log("VirtualFunctionNode received NodeOff event Inner", inputData);
                const mainValue = inputData?.value ?? "";
                //console.log("EVALUATE FUNCTION", this.node.id, mainValue);
                this.evaluateFunction(mainValue, "receiveNodeOff");
            }
        );

        this.eventBus.subscribe(
            node.id + ".main-input.sendNodeOn",
            (data) => {
                this.handleConnectedEdges(node, data, "receiveNodeOn",null);
            }
        );

        this.eventBus.subscribe(
            node.id + ".main-input.sendNodeOff",
            (data) => {
                //console.log("VirtualFunctionNode received NodeOff event", data);
                this.handleConnectedEdges(node, data, "receiveNodeOff",null);
            }
        );
    }

    private evaluateFunction(mainInput: string, eventStr:string) {
        try {
            // Compose argument list: main input + additional inputs
            const args = [mainInput, ...this.inputValues.map((v, i) => v || this.inputDefaults[i] || "")];
            const argNames = ["main", ...this.inputValues.map((_, i) => `input${i + 1}`)];
            // The function code should define a function named 'process'
            const func = new Function(
                ...argNames,
                `${this.functionCode}; return process(${argNames.join(",")});`
            );
            const result = func(...args);
            this.outputValue = result;
            if(Array.isArray(result)){
                result.forEach((res, index)=>{
                    //console.log("EMIT MULTI OUTPUT", index, res);
                    this.handleConnectedEdges(this.node, {value: res}, "receiveNodeOn", index);
                });
            }else{
                if(eventStr=="receiveNodeOn"){
                    this.eventBus.emit(`${this.node.id}.main-input.sendNodeOn`, { value: result });
                }else if (eventStr=="receiveNodeOff"){
                    this.eventBus.emit(`${this.node.id}.main-input.sendNodeOff`, { value: result });
                }
            }
            
        } catch (error) {
            console.error("Error evaluating function:", error);
            this.outputValue = "Error";
            this.eventBus.emit(`${this.node.id}.main-input.sendNodeOn`, { value: "Error" });
        }
    }

    setFunctionCode(code: string) {
        this.functionCode = code;
    }

    setNumInputs(n: number) {
        this.numInputs = n;
        while (this.inputDefaults.length < n) this.inputDefaults.push("");
        while (this.inputValues.length < n) this.inputValues.push("");
        this.inputDefaults = this.inputDefaults.slice(0, n);
        this.inputValues = this.inputValues.slice(0, n);
    }

    setInputDefaults(defaults: string[]) {
        this.inputDefaults = defaults.slice(0, this.numInputs);
        while (this.inputDefaults.length < this.numInputs) this.inputDefaults.push("");
    }

    getOutputValue() {
        return this.outputValue;
    }

    dispose() {
        for (let i = 0; i < this.numInputs; i++) {
            this.eventBus.unsubscribe(
                `${this.node.id}.input-${i}.receiveNodeOn`,
                (inputData: any) => {
                    this.inputValues[i] = inputData.data?.value ?? this.inputDefaults[i] ?? "";
                }
            );
        }
        this.eventBus.unsubscribe(
            `${this.node.id}.main-input.receiveNodeOn`,
            (inputData: any) => {
                const mainValue = inputData.data?.value ?? "";
                this.evaluateFunction(mainValue);
            }
        );
    }
}

export default VirtualFunctionNode;