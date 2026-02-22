// @ts-nocheck
import { Edge, Node } from "@xyflow/react";
import VirtualADSRNode from "../virtualNodes/VirtualADSRNode";
import VirtualBlockingSwitchNode from "../virtualNodes/VirtualBlockingSwitchNode";
import VirtualButtonNode from "../virtualNodes/VirtualButtonNode";
import VirtualMidiButtonNode from "../virtualNodes/VirtualMidiButtonNode";
import EventBus from "./EventBus";
import { SimpleIndexedDB } from "../util/SimpleIndexedDB";
import VirtualOscillatorNode from "../virtualNodes/VirtualOscillatorNode";
import EventManager from "./EventManager";
import VirtualLogNode from "../virtualNodes/VirtualLogNode";
import ADSRFlowNode, { ADSRFlowNodeProps } from "../nodes/ADSRFlowNode";
import SampleFlowNode, { SampleFlowNodeProps } from "../nodes/SampleFlowNode";
import { MasterOutFlowNodeProps } from "../nodes/MasterOutFlowNode";
import { AudioWorkletFlowNodeProps } from "../nodes/AudioWorkletFlowNode";
import { ChannelMergerFlowNodeProps } from "../nodes/ChannelMergerFlowNode";
import { BiquadFilterFlowNodeProps } from "../nodes/BiquadFilterFlowNode";
import { GainFlowNodeProps } from "../nodes/GainFlowNode";
import { DelayFlowNodeProps } from "../nodes/DelayFlowNode";
import { ReverbFlowNodeProps } from "../nodes/ReverbFlowNode";
import { IIRFilterFlowNodeProps } from "../nodes/IIRFilterFlowNode";
import { OscillatorFlowNodeProps } from "../nodes/OscillatorFlowNode";
import { DistortionFlowNodeProps } from "../nodes/DistortionFlowNode";
import { ChannelSplitterFlowNodeProps } from "../nodes/ChannelSplitterFlowNode";
import { DynamicCompressorFlowNodeProps } from "../nodes/DynamicCompressorFlowNode";
import { ClockNodeProps } from "../nodes/ClockFlowNode";
import { ConstantNodeProps } from "../nodes/ConstantFlowNode";
import { ConvolverFlowNodeProps } from "../nodes/ConvolverFlowNode";
import { FlowNodeProps } from "../nodes/FlowNode";
import FrequencyFlowNode, { FrequencyFlowNodeProps } from "../nodes/FrequencyFlowNode";
import { FunctionNodeProps } from "../nodes/FunctionFlowNode";
import { InputNodeProps } from "../nodes/InputNode";
import { OutputNodeProps } from "../nodes/OutputNode";
import { SignalRouterNodeProps } from "../nodes/SignalRouterFlowNode";
import { Switch } from "radix-ui";
import { SwitchFlowNodeProps } from "../nodes/SwitchFlowNode";
import { ButtonNodeProps } from "../nodes/ButtonFlowNode";
import { MidiButtonNodeProps } from "../nodes/MidiButtonFlowNode";
import virtualGainNode, { VirtualGainNode } from "../virtualNodes/VirtualGainNode";
import virtualDelayNode, { VirtualDelayNode } from "../virtualNodes/VirtualDelayNode";
import VirtualReverbNode from "../virtualNodes/VirtualReverbNode";
import VirtualBiquadFilterNode from "../virtualNodes/VirtualBiquadFilterNode";
import VirtualIIRFilterNode from "../virtualNodes/VirtualIIRFilterNode";
import VirtualDynamicCompressorNode from "../virtualNodes/VirtualDynamicCompressorNode";
import VirtualDistortionNode from "../virtualNodes/VirtualDistortionNode";
import VirtualMasterOut from "../virtualNodes/VirtualMasterOut";
import { VirtualAudioWorkletNode } from "../virtualNodes/VirtualAudioWorkletNode";
// (duplicate VirtualButtonNode import removed)
import VirtualClockNode from "../virtualNodes/VirtualClockNode";
import VirtualSwitchNode from "../virtualNodes/VirtualSwitchNode";
import VirtualConstantNode from "../virtualNodes/VirtualConstantNode";
import VirtualFrequencyNode from "../virtualNodes/VirtualFrequencyNode";
import VirtualFunctionNode from "../virtualNodes/VirtualFunctionNode";
import VirtualEventNode from "../virtualNodes/VirtualEventNode";
// duplicate VirtualADSRNode import removed
import VirtualFlowNode from "../virtualNodes/VirtualFlowNode";
import VirtualInputNode from "../virtualNodes/VirtualInputNode";
import VirtualOutputNode from "../virtualNodes/VirtualOutputNode";
import VirtualMidiNode from "../virtualNodes/VirtualMidiNode";
import VirtualOnOffButtonNode from "../virtualNodes/VirtualOnOffButtonNode";
import VirtualSampleFlowNode from "../virtualNodes/VirtualSampleFlowNode";
import VirtualSequencerNode from "../virtualNodes/VirtualSequencerNode";
import VirtualSequencerFrequencyNode from "../virtualNodes/VirtualSequencerFrequencyNode";
import VirtualAutomationNode from "../virtualNodes/VirtualAutomationNode";
import VirtualMidiKnobNode from "../virtualNodes/VirtualMidiKnobNode";
import { VirtualMouseTriggerButtonNode } from '../virtualNodes/VirtualMouseTriggerButtonNode';
import VirtualRecordingNode from "../virtualNodes/VirtualRecordingNode";
import VirtualMicNode from "../virtualNodes/VirtualMicNode";
import VirtualWebRTCInputNode from "../virtualNodes/VirtualWebRTCInputNode";
import VirtualWebRTCOutputNode from "../virtualNodes/VirtualWebRTCOutputNode";
import VirtualAnalyzerNodeGPT from "../virtualNodes/VirtualAnalyzerNodeGPT";
import VirtualOscilloscopeNode from "../virtualNodes/VirtualOscilloscopeNode";
import VirtualSpeedDividerNode from "../virtualNodes/VirtualSpeedDividerNode";
import VirtualAudioSignalFreqShifterNode from "../virtualNodes/VirtualAudioSignalFreqShifterNode";
import { AudioSignalFreqShifterFlowNodeProps } from "../nodes/AudioSignalFreqShifterFlowNode";
import VirtualFlowEventFreqShifterNode from "../virtualNodes/VirtualFlowEventFreqShifterNode";
import { FlowEventFreqShifterFlowNodeProps } from "../nodes/FlowEventFreqShifterFlowNode";
import VirtualEqualizerNode from "../virtualNodes/VirtualEqualizerNode";
import { EqualizerFlowNodeProps } from "../nodes/EqualizerFlowNode";
import VirtualVocoderNode from "../virtualNodes/VirtualVocoderNode";
import { VocoderFlowNodeProps } from "../nodes/VocoderFlowNode";
import VirtualMidiFileNode from "../virtualNodes/VirtualMidiFileNode";
import { MidiFileFlowNodeProps } from "../nodes/MidiFileFlowNode";
import VirtualAudioWorkletOscillatorNode from "../virtualNodes/VirtualAudioWorkletOscillatorNode";
import {
    loadRootHandle,
    loadFlowFromDisk,
} from "../util/FileSystemAudioStore";


export type DataBaseNode = {
    nodes: Node[];
    edges: Edge[];
};

type AudioNodeData = {
    frequency?: number;
    type?: OscillatorType;
    gain?: number;
    delayTime?: number;
    filterType?: BiquadFilterType;
    threshold?: number;
    ratio?: number;
    curve?: Float32Array | null;
    oversample?: OverSampleType;
    processorUrl?: string;
    smoothingTimeConstant?: number;
    fftSize?: number;
    minDecibels?: number;
    maxDecibels?: number;
};

type cNode = ButtonNodeProps;

export type CustomNode = {
    id: string;
    type: string;
    data: unknown;
    parentNode?: CustomNode | null;
    functions?: {
        [key: string]: (...args: any[]) => void;
    };
};

export interface ExtendedOscillatorNode extends OscillatorNode {
    playbackState?: string;
}

const webAudioApiFlowNodes = [
    "MasterOutFlowNode",
    "OscillatorFlowNode",
    "BiquadFilterFlowNode",
    "DynamicCompressorFlowNode",
    "GainFlowNode",
    "CrossfaderFlowNode",
    "DelayFlowNode",
    "ReverbFlowNode",
    "DistortionFlowNode",
    "AudioWorkletFlowNode",
    "IIRFilterFlowNode",
    "SampleFlowNode",
    "MicFlowNode",
    "WebRTCInputFlowNode",
    "WebRTCOutputFlowNode",
    "WebRTCPulseNode",
    "WebSocketAudioNode",
    "RecordingFlowNode",
    "AnalyzerNodeGPT",
    "OscilloscopeFlowNode",
    "AudioSignalFreqShifterFlowNode",
    "AudioWorkletOscillatorFlowNode",
    "EqualizerFlowNode",
    "VocoderFlowNode",
];

export type VirtualNodeType = VirtualFlowNode |
    AudioContext |
    VirtualBiquadFilterNode |
    VirtualDynamicCompressorNode |
    VirtualGainNode |
    VirtualCrossfaderNode |
    VirtualDelayNode |
    VirtualReverbNode |
    VirtualDistortionNode |
    VirtualOscillatorNode |
    VirtualADSRNode |
    VirtualInputNode |
    VirtualOutputNode |
    VirtualMasterOut |
    VirtualAudioWorkletNode |
    VirtualButtonNode |
    VirtualMidiButtonNode |
    VirtualClockNode |
    VirtualSwitchNode |
    VirtualConstantNode |
    VirtualFrequencyNode |
    VirtualFunctionNode |
    VirtualBlockingSwitchNode |
    VirtualLogNode |
    VirtualMicNode |
    VirtualRecordingNode |
    VirtualWebRTCPulseNode |
    VirtualWebSocketAudioNode |
    VirtualWebRTCInputNode |
    VirtualWebRTCOutputNode |
    VirtualAnalyzerNodeGPT |
    VirtualOscilloscopeNode |
    VirtualAudioSignalFreqShifterNode |
    VirtualFlowEventFreqShifterNode |
    VirtualVocoderNode;

export class AudioGraphManager {
    private audioContext: AudioContext;
    public virtualEdges: Map<string, Edge[]>;
    private eventBus: EventBus;
    private eventManager: EventManager;
    private nodesRef: React.RefObject<Node[]>;
    private edgesRef: React.RefObject<Edge[]>;
    public sourceNodeMapConnectionTree: Map<string, Set<string>> = new Map(); // Map of source node IDs to sets of target node IDs
    public targetNodeMapConnectionTree: Map<string, Set<string>> = new Map(); // Map of target node IDs to sets of source node IDs
    public virtualNodes: Map<
        string,
        VirtualNodeType
    >;
    // Remember original parameter value per nodeId+handle for automation restarts
    private automationBaseParamValues: Map<string, number> = new Map();

    constructor(
        audioContext: AudioContext,
        nodesRef: React.RefObject<any[]>,
        edgesRef: React.RefObject<any[]>,
    ) {
        this.audioContext = audioContext;
        this.virtualNodes = new Map<string, VirtualFlowNode & unknown | AudioContext>();
        this.eventBus = EventBus.getInstance();
        this.eventManager = EventManager.getInstance();
        this.db = new SimpleIndexedDB("FlowSynthDB", "flows");
        this.nodesRef = nodesRef;
        this.edgesRef = edgesRef;
        this.virtualEdges = new Map<string, Edge[]>();
        this.sourceNodeMapConnectionTree = new Map(); // Initialize the map
        this.targetNodeMapConnectionTree = new Map(); // Initialize the map


        this.createVirtualNodes = this.createVirtualNodes.bind(this); // Bind the method
        this.handleReceiveNodeOn = this.handleReceiveNodeOn.bind(this);
        this.handleReceiveNodeOff = this.handleReceiveNodeOff.bind(this);
        this.emitEventsForConnectedEdges = this.emitEventsForConnectedEdges.bind(this); // Bind the method
        this.addVirtualNode = this.addVirtualNode.bind(this); // Bind the method
        this.handleConnectedEdges = this.handleConnectedEdges.bind(this); // Bind the method
        this.handleConnectedEdgesFromOutput = this.handleConnectedEdgesFromOutput.bind(this);
        // Bind the method
    }

    /**
     * Load a flow by name, preferring disk over IndexedDB.
     * Returns the flow data or null if not found.
     */
    private async loadFlowByName(
        flowName: string
    ): Promise<DataBaseNode | null> {
        // Try disk first
        try {
            const fsHandle = await loadRootHandle();
            if (fsHandle) {
                const diskFlow = await loadFlowFromDisk(
                    fsHandle,
                    flowName,
                    ''
                );
                if (diskFlow) {
                    return {
                        nodes: diskFlow.nodes || [],
                        edges: diskFlow.edges || [],
                    };
                }
            }
        } catch (e) {
            console.warn(
                '[AudioGraphManager] Disk load failed for',
                flowName,
                e
            );
        }

        // Fallback to IndexedDB
        try {
            const result = await this.db.get(flowName);
            if (result && result[0]) {
                return {
                    nodes: result[0].nodes || result[0].value?.nodes || [],
                    edges: result[0].edges || result[0].value?.edges || [],
                };
            }
        } catch (e) {
            console.warn(
                '[AudioGraphManager] DB load failed for',
                flowName,
                e
            );
        }

        return null;
    }

    async connectCustomNode(node: DataBaseNode, parentNode: CustomNode | null = null) {
        // Connect the custom node to the audio graph
        if (node) {
            this.connectVirtualNodes(node.edges);
        } else {
            console.warn(`Custom node with ID ${node.id} not found in IndexedDB.`);
        }
    }

    public dispose() {
        try {
            this.eventManager.clearButtonCallbacks();
        } catch { /* noop */ }

        // Dispose each virtual node and its underlying AudioNode if present.
        for (const [nodeId, node] of this.virtualNodes) {
            if (!node) continue;

            try {
                // Unsubscribe any events scoped to this node.
                try {
                    this.eventBus.unsubscribeAllByNodeId(nodeId);
                } catch { /* noop */ }

                const maybeAudio = (node as any).audioNode;
                if (maybeAudio instanceof AudioNode) {
                    try { maybeAudio.disconnect(); } catch { /* noop */ }
                }

                if (node instanceof AudioNode) {
                    try { node.disconnect(); } catch { /* noop */ }
                }

                // Virtual nodes usually implement a custom dispose().
                if (typeof (node as any).dispose === 'function') {
                    try { (node as any).dispose(); } catch { /* noop */ }
                }

                // Some virtual nodes expose output/input nodes.
                try {
                    const out = typeof (node as any).getOutputNode === 'function'
                        ? (node as any).getOutputNode()
                        : undefined;
                    if (out instanceof AudioNode) {
                        try { out.disconnect(); } catch { /* noop */ }
                    }
                } catch { /* noop */ }
                try {
                    const inp = typeof (node as any).getInputNode === 'function'
                        ? (node as any).getInputNode()
                        : undefined;
                    if (inp instanceof AudioNode) {
                        try { inp.disconnect(); } catch { /* noop */ }
                    }
                } catch { /* noop */ }

                this.disconnectFromMaps(nodeId);
            } catch (e) {
                console.warn('[AudioGraphManager] dispose node failed', nodeId, e);
            }
        }

        // Clear all internal state.
        try { this.virtualNodes.clear(); } catch { /* noop */ }
        try { this.virtualEdges = new Map<string, Edge[]>(); } catch { /* noop */ }
        try { this.sourceNodeMapConnectionTree.clear(); } catch { /* noop */ }
        try { this.targetNodeMapConnectionTree.clear(); } catch { /* noop */ }
        try { this.automationBaseParamValues.clear(); } catch { /* noop */ }
    }

    async initialize() {

        await this.createVirtualNodes(this.nodesRef.current, null);
        this.connectVirtualNodes(this.edgesRef.current);
    }

    private isAudioParamTargetHandle(
        targetNodeId: string,
        targetNodeHandle: string | null | undefined
    ): boolean {
        if (!targetNodeHandle) return false;
        const virtualTarget: any = this.virtualNodes.get(
            targetNodeId
        );
        const audioNode: any = virtualTarget?.audioNode;
        if (!audioNode) return false;

        if (targetNodeHandle in audioNode) return true;

        const params: any = audioNode.parameters;
        if (params && typeof params.has === 'function') {
            return params.has(targetNodeHandle);
        }

        return false;
    }

    emitEventsForConnectedEdges(
        node: CustomNode,
        data: any,
        eventType: string = "receivenodeOn"
    ) {
        // Filter edges connected to the source node
        let connectedEdges = this.virtualEdges.get(node.id);

        if (!connectedEdges || connectedEdges.length === 0) {
            const fallbackEdges = this.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
            if (fallbackEdges.length) {
                fallbackEdges.forEach((edge) => this.addConnection(edge));
                connectedEdges = this.virtualEdges.get(node.id) || fallbackEdges;
            }
        }

        if (!connectedEdges || connectedEdges.length === 0) {
            console.warn(`No connected edges found for node: ${node.id}`);
            return;
        }

        // Filter by sourceHandle if provided in data
        const sourceHandle = data?.sourceHandle;

        connectedEdges.forEach((edge) => {
            // If sourceHandle is specified, filter edges:
            // - Match if edge.sourceHandle equals sourceHandle
            // - Also allow if edge has no sourceHandle (legacy/untyped)
            if (sourceHandle &&
                edge.sourceHandle &&
                edge.sourceHandle !== sourceHandle) {
                return;
            }

            const targetNodeId = edge.target;
            const targetNodeHandle = edge.targetHandle;

            // Check if target is a WebAudio node that needs updateParams
            if (targetNodeId != null) {
                const typeSplit = targetNodeId.split(".");
                if (typeSplit) {
                    const type = typeSplit[typeSplit.length - 1];
                    if (webAudioApiFlowNodes.includes(type)) {
                        if (!this.isAudioParamTargetHandle(
                            targetNodeId,
                            targetNodeHandle
                        )) {
                            // Not a real AudioParam/property (e.g. SampleFlowNode
                            // segment handles). Treat as event edge.
                            // Fall through to emit receiveNodeOn/Off.
                        } else {
                            // For WebAudio nodes, emit updateParams with value
                            const targetNodeHandleData = data.value;
                            const targetDataObject = {
                                nodeId: targetNodeId,
                                source: node.id,
                                data: {
                                    [targetNodeHandle]: targetNodeHandleData,
                                }
                            };
                            if (eventType !== "receiveNodeOff") {
                                this.eventBus.emit(
                                    `${targetNodeId}.params.updateParams`,
                                    targetDataObject
                                );
                            }

                        }
                    }
                }
            }

            // Emit the "nodeOn" event to the connected nodes
            const eventChannel = `${targetNodeId}.${targetNodeHandle}.${eventType}`;
            this.eventBus.emit(eventChannel, {
                nodeId: targetNodeId,
                source: node.id,
                ...data,
            });
        });
    }


    handleSendNodeEventSwitch(node: CustomNode & SwitchFlowNodeProps, data: any, eventType: string) {
        const connectedEdges = this.virtualEdges.get(node.id);
        const activeOutput = "output-" + data.activeOutput;
        if (!connectedEdges) {
            console.warn(`No connected edges found for node: ${node.id}`);
            return;
        }
        connectedEdges.forEach((edge) => {
            if (activeOutput == edge.sourceHandle) {
                const targetNodeId = edge.target;
                if (targetNodeId != null) {
                    const typeSplit = targetNodeId.split(".");
                    if (typeSplit) {
                        const type = typeSplit[typeSplit.length - 1];
                        if (webAudioApiFlowNodes.includes(type)) {
                            const targetNodeHandle = edge.targetHandle;
                            let targetNodeHandleData = data.value;
                            let targetDataObject = {
                                nodeId: targetNodeId,
                                source: node.id,
                                data: {
                                    [targetNodeHandle]: targetNodeHandleData,
                                    value: targetNodeHandleData,  // Include 'value' for compatibility with oscillator nodes
                                }
                            }
                            if (eventType !== "receiveNodeOff") {
                                this.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
                                return;
                            }
                        }
                    }
                }

                // Emit the "receiveNodeOn" event to the connected nodes
                this.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                    ...data,
                    nodeId: targetNodeId,
                    source: node.id,
                });
            }
        });
    }



    /**
     * Route an event to only those edges whose sourceHandle matches the given handle.
     * Same pattern as handleSendNodeEventSwitch but keyed by an explicit handle name
     * instead of "output-N".
     */
    handleSendNodeEventByHandle(node: CustomNode, data: any, eventType: string, sourceHandle: string) {
        const connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges || connectedEdges.length === 0) {
            const fallbackEdges = this.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
            if (fallbackEdges.length) {
                fallbackEdges.forEach((edge) => this.addConnection(edge));
            }
        }
        const edges = this.virtualEdges.get(node.id);
        if (!edges) return;

        edges.forEach((edge) => {
            // Only send to edges originating from the specified handle
            if (edge.sourceHandle !== sourceHandle) return;

            const targetNodeId = edge.target;
            const targetNodeHandle = edge.targetHandle;
            if (!targetNodeId) return;

            // WebAudio param routing (same logic as handleSendNodeEventSwitch)
            const typeSplit = targetNodeId.split(".");
            const type = typeSplit[typeSplit.length - 1];
            if (webAudioApiFlowNodes.includes(type)) {
                if (this.isAudioParamTargetHandle(targetNodeId, targetNodeHandle)) {
                    if (eventType !== "receiveNodeOff") {
                        this.eventBus.emit(`${targetNodeId}.params.updateParams`, {
                            nodeId: targetNodeId,
                            source: node.id,
                            data: {
                                [targetNodeHandle]: data.value,
                                value: data.value,
                            }
                        });
                    }
                    return;
                }
            }

            // Normal event routing
            this.eventBus.emit(`${targetNodeId}.${targetNodeHandle}.${eventType}`, {
                ...data,
                nodeId: targetNodeId,
                source: node.id,
            });
        });
    }

    handleReceiveNodeOnCustom(node: CustomNode, inputIndex: number, data: any) {
        this.eventBus.emit(node.id + ".input-" + inputIndex + ".receiveNodeOn", {
            nodeId: node.id,
            ...data,
        });
        //console.log("Received data:", data, "for node:", node, "inputIndex:", inputIndex)
    }

    handleReceiveNodeOffCustom(node: CustomNode, inputIndex: number, data: any) {
        this.eventBus.emit(node.id + ".input-" + inputIndex + ".receiveNodeOff", {
            nodeId: node.id,
            ...data,
        });
        //console.log("Received data:", data, "for node:", node, "inputIndex:", inputIndex)
    }

    handleReceiveOutput(node: CustomNode, data: any, eventType: string) {
        const parentNode = node.parentNode;
        if (parentNode) {
            this.eventBus.emit(parentNode.id + ".output-" + node.data.index + "." + eventType, {
                nodeId: node.id,
                outputIndex: node.data.index,
                ...data,
            });
        } else {
            console.warn("Parent node not found for output node:", node);
        }
    }

    handleReceiveNodeOn(node: Node, data: any) {
        //console.log("Received data:", data, "for node:", node);
        // Handle the event as needed
    }

    handleReceiveNodeOff(node: Node, data: any) {
        //console.log("Received data:", data, "for node:", node);
        // Handle the event as needed
    }

    handleEdgeADSR(edge: Edge, node: CustomNode<ADSRFlowNodeProps>) {
        const targetNodeId = edge.target;
        const virtualTarget = this.virtualNodes.get(targetNodeId) as any;
        if (!virtualTarget || !(virtualTarget.audioNode instanceof AudioNode)) return;
        const paramName: string = edge.targetHandle as string;
        const audioParam: AudioParam | undefined = (virtualTarget.audioNode as any)[paramName];
        if (!(audioParam instanceof AudioParam)) return;

        // Derive configured base value prioritizing virtual node's own data.
        const rawBase = virtualTarget?.node?.data?.[paramName];
        const fallbackBase = this.nodesRef.current.find((n: any) => n.id === targetNodeId)?.data?.[paramName];
        const baseValue = (typeof rawBase === 'number' ? rawBase : (typeof fallbackBase === 'number' ? fallbackBase : 1));

        const attackTime = node.data?.attackTime || 0.1;
        const sustainTime = node.data?.sustainTime || 0.5;
        const sustainLevel = node.data?.sustainLevel || 0.7;
        const minPercent = (node.data?.minPercent ?? 0) / 100;
        const maxPercent = (node.data?.maxPercent ?? 100) / 100;
        const minAbs = baseValue * minPercent;
        const maxAbs = baseValue * maxPercent;
        const now = this.audioContext.currentTime;
        // Start from minAbs (or current if already above) then ramp.
        audioParam.cancelScheduledValues(now);
        const startVal = audioParam.value > minAbs ? audioParam.value : minAbs;
        audioParam.setValueAtTime(startVal, now);
        audioParam.linearRampToValueAtTime(maxAbs, now + attackTime);
        const sustainAbs = minAbs + (maxAbs - minAbs) * sustainLevel;
        audioParam.linearRampToValueAtTime(sustainAbs, now + attackTime + sustainTime);
    }

    handleConnectedEdgesADSRNodeOn(
        node: CustomNode,
        data: any,
        eventType: string
    ) {
        let connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges || connectedEdges.length === 0) {
            const fallbackEdges = this.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
            if (fallbackEdges.length) {
                fallbackEdges.forEach(edge => this.addConnection(edge));
                connectedEdges = this.virtualEdges.get(node.id) || fallbackEdges;
            }
        }
        if (!connectedEdges || connectedEdges.length === 0) {
            console.warn(`No connected edges found for node: ${node.id}`);
            return;
        }
        // Sort edges: those with 'reset' in targetHandle first
        const sortedEdges = this.sortEdges(connectedEdges);
        for (const edge of sortedEdges) {
            this.handleEdgeADSR(edge, node);
        }
    }

    handleConnectedEdgesAutomationNodeOn(
        node: CustomNode,
        data: any,
        eventType: string = 'receiveNodeOn'
    ) {
        const connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges) return;
        const points: { x: number; y: number }[] = Array.isArray(node.data?.points) ? [...node.data.points].sort((a, b) => a.x - b.x) : [];
        if (points.length < 2) return;
        const lengthSec = typeof node.data?.lengthSec === 'number' ? node.data.lengthSec : 1;
        const minPercent = (typeof node.data?.min === 'number' ? node.data.min : 0);
        const maxPercent = (typeof node.data?.max === 'number' ? node.data.max : 200);
        const loop = !!node.data?.loop; // currently unused for scheduling (one-shot)
        const spanPercent = (maxPercent - minPercent) || 1;
        connectedEdges.forEach((edge: Edge) => {
            const targetNodeId = edge.target;
            const virtualTarget = this.virtualNodes.get(targetNodeId);
            if (!virtualTarget || !(virtualTarget as any).audioNode) return;
            const audioNode: any = (virtualTarget as any).audioNode;
            const targetHandle: string = edge.targetHandle as string;
            const param: AudioParam | undefined = audioNode[targetHandle];
            if (!(param instanceof AudioParam)) return;
            // NEW: derive base value from the stored node data (original configured value) instead of current param.value
            const configuredBase = virtualTarget?.node?.data?.[targetHandle];
            const baseValue: number = (typeof configuredBase === 'number' && !isNaN(configuredBase)) ? configuredBase : 1;
            const now = this.audioContext.currentTime;
            param.cancelScheduledValues(now);
            points.forEach((p, idx) => {
                const t = now + (p.x * lengthSec);
                const percent = maxPercent - p.y * spanPercent; // y=0 => maxPercent, y=1 => minPercent
                const absValue = baseValue * (percent / 100);
                if (idx === 0) {
                    param.setValueAtTime(absValue, t);
                } else {
                    param.linearRampToValueAtTime(absValue, t);
                }
            });

        });
    }

    /**
     * Automation node off: currently just stops further scheduled ramps by cancelling future values.
     * Could optionally ramp back to base or hold last value.
     */
    handleConnectedEdgesAutomationNodeOff(
        node: CustomNode,
        data: any,
        eventType: string = 'receiveNodeOff'
    ) {
        const connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges) return;
        const now = this.audioContext.currentTime;
        connectedEdges.forEach((edge: Edge) => {
            const targetNodeId = edge.target;
            const virtualTarget = this.virtualNodes.get(targetNodeId);
            if (!virtualTarget || !(virtualTarget as any).audioNode) return;
            const audioNode: any = (virtualTarget as any).audioNode;
            const targetHandle: string = edge.targetHandle as string;
            const param: AudioParam | undefined = audioNode[targetHandle];
            if (!(param instanceof AudioParam)) return;
            param.cancelScheduledValues(now);
        });
    }

    handleConnectedEdgesADSRNodeOff(node: CustomNode, data: any, eventType: string) {
        let connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges || connectedEdges.length === 0) {
            const fallbackEdges = this.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
            if (fallbackEdges.length) {
                fallbackEdges.forEach(edge => this.addConnection(edge));
                connectedEdges = this.virtualEdges.get(node.id) || fallbackEdges;
            }
        }
        if (!connectedEdges || connectedEdges.length === 0) {
            console.warn(`No connected edges found for node: ${node.id}`);
            return;
        }
        connectedEdges.forEach((edge: Edge) => {
            const targetNodeId = edge.target;
            const virtualTarget = this.virtualNodes.get(targetNodeId) as any;
            if (!virtualTarget || !(virtualTarget.audioNode instanceof AudioNode)) return;
            const paramName: string = edge.targetHandle as string;
            const audioParam: AudioParam | undefined = (virtualTarget.audioNode as any)[paramName];
            if (!(audioParam instanceof AudioParam)) return;
            const rawBase = virtualTarget?.node?.data?.[paramName];
            const fallbackBase = this.nodesRef.current.find((n: any) => n.id === targetNodeId)?.data?.[paramName];
            const baseValue = (typeof rawBase === 'number' ? rawBase : (typeof fallbackBase === 'number' ? fallbackBase : 1));
            const minPercent = (node.data?.minPercent ?? 0) / 100;
            const minAbs = baseValue * minPercent;
            const releaseTime = node.data?.releaseTime || 0.3;
            const now = this.audioContext.currentTime;
            audioParam.cancelScheduledValues(now);
            audioParam.setValueAtTime(audioParam.value, now);
            audioParam.linearRampToValueAtTime(minAbs, now + releaseTime);
        });
    }

    //TODO this is GARBAGE !!! Change!!!!!
    handleConnectedEdges(
        node: CustomNode,
        data: any,
        eventType: string,
        index: number | null | string = null
    ) {
        const connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges) {
            console.warn(`No connected edges found for node: ${node.id}`);
            return;
        }

        for (let i = 0; i < connectedEdges.length; i++) {
            const edge = connectedEdges[i];
            const targetNodeId = edge.target;
            if (targetNodeId !== null) {
                const typeSplit = targetNodeId.split(".");
                if (typeSplit) {
                    const type = typeSplit[typeSplit.length - 1];
                    if (webAudioApiFlowNodes.includes(type) && type !== "SampleFlowNode") {
                        const targetNodeHandle = edge.targetHandle;
                        let targetNodeHandleData = data.value;
                        if (Array.isArray(data) && index !== null) {
                            targetNodeHandleData = data.value[index || 0];
                        }
                        const targetDataObject = {
                            nodeId: targetNodeId,
                            source: node.id,
                            data: {
                                [targetNodeHandle]: targetNodeHandleData,
                                value: targetNodeHandleData,
                            }
                        };
                        if (eventType !== "receiveNodeOff") {
                            if (index !== null) {
                                if (edge.sourceHandle === "output-" + index) {
                                    this.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
                                }
                            } else {
                                this.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
                            }
                            continue;
                        }
                    }
                }
            }
            if (index !== null) {
                if (edge.sourceHandle && edge.sourceHandle.startsWith("output-")) {
                    if (edge.sourceHandle !== "output-" + index) {
                        continue;
                    }
                    const rawPayload = Array.isArray(data) ? data[index] : data;
                    const payload =
                        rawPayload && typeof rawPayload === 'object'
                            ? rawPayload
                            : { value: rawPayload };
                    this.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                        ...payload,
                        nodeId: targetNodeId,
                        source: node.id,
                    });
                    continue;
                }
                if (edge.sourceHandle !== index) {  
                    continue;
                } else{
                    const rawPayload = Array.isArray(data) ? data[index] : data;
                    const payload =
                        rawPayload && typeof rawPayload === 'object'
                            ? rawPayload
                            : { value: rawPayload };
                    this.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                        ...payload,
                        nodeId: targetNodeId,
                        source: node.id,
                    });
                }
            } else {
                this.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                    ...data,
                    nodeId: targetNodeId,
                    source: node.id,
                });
            }
        }
    }

    sortEdges(connectedEdges: Edge[]) {
        // Sort edges: those with 'reset' in targetHandle first
        const sortedEdges = connectedEdges.sort((a, b) => {
            const aReset = (a.targetHandle || '').toLowerCase().includes('reset') ? -1 : 0;
            const bReset = (b.targetHandle || '').toLowerCase().includes('reset') ? -1 : 0;
            return bReset - aReset;
        });
        return sortedEdges;
    }

    // Filtered version used when a specific output index fired
    handleConnectedEdgesFromOutput(
        node: CustomNode,
        outputIndex: number,
        data: any,
        eventType: string
    ) {
        const connectedEdges = this.virtualEdges.get(node.id);
        if (!connectedEdges) return;
        const sourceHandle = "output-" + outputIndex;
        connectedEdges.forEach(edge => {
            if (edge.sourceHandle !== sourceHandle) return;
            const targetNodeId = edge.target;
            if (targetNodeId != null) {
                const typeSplit = targetNodeId.split(".");
                if (typeSplit) {
                    const type = typeSplit[typeSplit.length - 1];
                    // Exclude SampleFlowNode from updateParams path
                    // since its segment handles are event triggers
                    if (webAudioApiFlowNodes.includes(type) &&
                        type !== "SampleFlowNode") {
                        const targetNodeHandle = edge.targetHandle;
                        const targetNodeHandleData = data.value;
                        const targetDataObject = {
                            nodeId: targetNodeId,
                            source: node.id,
                            data: { [targetNodeHandle]: targetNodeHandleData }
                        };
                        if (eventType !== "receiveNodeOff") {
                            this.eventBus.emit(
                                `${targetNodeId}.params.updateParams`,
                                targetDataObject
                            );
                            return;
                        }
                    }
                }
            }
            this.eventBus.emit(
                `${targetNodeId}.${edge.targetHandle}.${eventType}`,
                {
                    ...data,
                    nodeId: targetNodeId,
                    source: node.id,
                }
            );
        });
    }

    handleButtonUpdateParam(node: CustomNode, data: any, key: string) {
        if (key === "assignedKey") {
            (node as ButtonNodeProps).data.assignedKey = data.value;
            this.eventManager.addButtonDownCallback(data.value, node.id, (data) => {
                this.eventBus.emit(node.id + ".main-input.sendNodeOn", {
                    nodeid: node.id,
                });
            });
            this.eventManager.addButtonUpCallback(data.value, node.id, (data) => {
                this.eventBus.emit(node.id + ".main-input.sendNodeOff", {
                    nodeid: node.id,
                });
            });
        }
        if (key === "retriggerFrequency") {
            // handle retriggering here if wanted
            //(node as ButtonNodeProps).data.retriggerFrequency = data.value;
        }
        if (key === "retriggerLength") {
            //handle retriggering length if wanted
        }
    }

    public async addVirtualNode(node: CustomNode, parentNode: CustomNode | null) {
        if (!this.virtualNodes.has(node.id)) {
            if (parentNode) {
                node.id = parentNode.id + "." + node.id;
            }
            let nodeData = node.data as AudioNodeData;
            //console.log(node);
            switch (node.type) {
                case "AudioWorkletOscillatorFlowNode":
                    // New AudioWorklet-based oscillator node
                    const virtualAWOscNode = new VirtualAudioWorkletOscillatorNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & AudioWorkletFlowNodeProps
                    );
                    await virtualAWOscNode.render(
                        nodeData.frequency || 440,
                        nodeData.type || "sine"
                    );
                    this.virtualNodes.set(node.id, virtualAWOscNode);
                    break;
                case "SampleFlowNode":
                    const virtualSampleFlowNode = new VirtualSampleFlowNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    virtualSampleFlowNode.render();
                    this.virtualNodes.set(node.id, virtualSampleFlowNode);
                    break;
                case "OscillatorFlowNode":
                    const oscNode = new VirtualOscillatorNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & OscillatorFlowNodeProps,
                        this.resetConnectionsOfNode.bind(this)
                    );
                    oscNode.render(
                        nodeData.frequency || 440,
                        nodeData.type || "sine",
                        nodeData.pulseWidth,
                        nodeData.periodicWaveHarmonics,
                    );
                    this.virtualNodes.set(node.id, oscNode);
                    break;
                case "GainFlowNode":
                    const virtualGainNode = new VirtualGainNode(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    virtualGainNode.render(nodeData.gain ?? 1);
                    this.virtualNodes.set(node.id, virtualGainNode);
                    break;

                case "CrossfaderFlowNode":
                    const crossfaderNode = new VirtualCrossfaderNode(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    crossfaderNode.render(nodeData.crossfade || 0);
                    this.virtualNodes.set(node.id, crossfaderNode);
                    break;

                case "DelayFlowNode":
                    const delayNode = new VirtualDelayNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & DelayFlowNodeProps
                    );
                    // UI stores delayTime in milliseconds now; default to 500ms.
                    const initialDelayMs = typeof nodeData.delayTime === 'number' && Number.isFinite(nodeData.delayTime) ? nodeData.delayTime : 500;
                    delayNode.render(initialDelayMs);
                    this.virtualNodes.set(node.id, delayNode);
                    break;
                case "ReverbFlowNode":
                    const reverbNode = new VirtualReverbNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & ReverbFlowNodeProps
                    );
                    const initialSeconds = typeof (node.data as any)?.seconds === 'number' ? (node.data as any).seconds : undefined;
                    const initialDecay = typeof (node.data as any)?.decay === 'number' ? (node.data as any).decay : undefined;
                    const initialReverse = typeof (node.data as any)?.reverse === 'boolean' ? (node.data as any).reverse : undefined;
                    const initialFormula = typeof (node.data as any)?.formula === 'string' ? (node.data as any).formula : undefined;
                    reverbNode.render(initialSeconds, initialDecay, initialReverse, initialFormula);
                    this.virtualNodes.set(node.id, reverbNode);
                    break;
                case "BiquadFilterFlowNode":
                    const virtualBiquadFilterNode = new VirtualBiquadFilterNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & BiquadFilterFlowNodeProps
                    );
                    virtualBiquadFilterNode.render(
                        nodeData.filterType || "lowpass",
                        nodeData.frequency || 1000,
                        nodeData.Q ?? 0,
                        nodeData.gain ?? 0,
                        nodeData.detune ?? 0
                    );
                    this.virtualNodes.set(node.id, virtualBiquadFilterNode);
                    break;
                case "IIRFilterFlowNode":
                    const virtualIIRFilterNode = new VirtualIIRFilterNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & IIRFilterFlowNodeProps,
                        this.resetConnectionsOfNode.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualIIRFilterNode);
                    break;
                case "DynamicCompressorFlowNode":
                    const compressor = new VirtualDynamicCompressorNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & DynamicCompressorFlowNodeProps
                    );
                    compressor.render(
                        nodeData.threshold || -24,
                        nodeData.knee || 30,
                        nodeData.ratio || 12,
                        nodeData.attack || 0.003,
                        nodeData.release || 0.25
                    );
                    this.virtualNodes.set(node.id, compressor);
                    break;
                case "SequencerFlowNode":
                    const virtualSequencerNode = new VirtualSequencerNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & FlowNodeProps
                    );
                    virtualSequencerNode.setSendNodeOn((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
                    virtualSequencerNode.setSendNodeOff((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
                    this.virtualNodes.set(node.id, virtualSequencerNode);
                    break;
                case "SequencerFrequencyFlowNode":
                    const virtualSequencerFrequencyNode = new VirtualSequencerFrequencyNode(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    virtualSequencerFrequencyNode.setSendNodeOn((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
                    virtualSequencerFrequencyNode.setSendNodeOff((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
                    this.virtualNodes.set(node.id, virtualSequencerFrequencyNode);
                    break;
                case "MidiFileFlowNode":
                    const virtualMidiFileNode = new VirtualMidiFileNode(
                        this.eventBus,
                        node as CustomNode & MidiFileFlowNodeProps,
                        this.emitEventsForConnectedEdges.bind(this),
                        this.handleSendNodeEventByHandle.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualMidiFileNode as any);
                    break;
                case "DistortionFlowNode":
                    const virtualDistortionNode = new VirtualDistortionNode(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    // Parse curve string to Float32Array
                    let curveArray: Float32Array | null = null;
                    if (nodeData.curve && typeof nodeData.curve === 'string') {
                        const values = nodeData.curve.split(',').map(Number);
                        curveArray = new Float32Array(values);
                    }
                    virtualDistortionNode.render(
                        curveArray,
                        nodeData.oversample || "none"
                    );
                    this.virtualNodes.set(node.id, virtualDistortionNode);
                    break;
                case "AutomationFlowNode":
                    const virtualAutomationNode = new VirtualAutomationNode(
                        this.eventBus,
                        node as any
                    );
                    // Subscribe to trigger events and schedule automation on connected params
                    this.eventBus.subscribe(node.id + '.main-input.sendNodeOn', (data: any) => {
                        this.handleConnectedEdgesAutomationNodeOn(node as any, data, 'receiveNodeOn');
                    });
                    this.eventBus.subscribe(node.id + '.main-input.sendNodeOff', (data: any) => {
                        this.handleConnectedEdgesAutomationNodeOff(node as any, data, 'receiveNodeOff');
                    });
                    this.virtualNodes.set(node.id, virtualAutomationNode as any);
                    break;
                case "AnalyzerNodeGPT":
                    const virtualAnalyzer = new VirtualAnalyzerNodeGPT(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    virtualAnalyzer.render(nodeData);
                    this.virtualNodes.set(node.id, virtualAnalyzer as any);
                    break;
                case "OscilloscopeFlowNode":
                    const virtualOscilloscope = new VirtualOscilloscopeNode(
                        this.audioContext,
                        this.eventBus,
                        node
                    );
                    virtualOscilloscope.render(nodeData);
                    this.virtualNodes.set(node.id, virtualOscilloscope as any);
                    break;
                case "EqualizerFlowNode":
                    const virtualEqualizer = new VirtualEqualizerNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & EqualizerFlowNodeProps
                    );
                    virtualEqualizer.render(nodeData);
                    this.virtualNodes.set(node.id, virtualEqualizer as any);
                    break;
                case "VocoderFlowNode":
                    const virtualVocoder = new VirtualVocoderNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & VocoderFlowNodeProps
                    );
                    virtualVocoder.render({
                        bandCount: nodeData.bandCount,
                        lowFreq: nodeData.lowFreq,
                        highFreq: nodeData.highFreq,
                        attackTime: nodeData.attackTime,
                        releaseTime: nodeData.releaseTime,
                        qFactor: nodeData.qFactor,
                        carrierGain: nodeData.carrierGain,
                        modulatorGain: nodeData.modulatorGain,
                        outputGain: nodeData.outputGain
                    });
                    this.virtualNodes.set(node.id, virtualVocoder as any);
                    break;
                case "MasterOutFlowNode":
                    // Use a virtual master out wrapper instead of the raw AudioContext
                    const virtualMasterOut = new VirtualMasterOut(this.audioContext, this.eventBus, node);
                    this.virtualNodes.set(node.id, virtualMasterOut);
                    break;
                case "AudioWorkletFlowNode":
                    // Dynamic inline processor creation (nodeData.processorCode optional)
                    const dynamicWorkletNode = new VirtualAudioWorkletNode(
                        this.audioContext,
                        this.eventBus,
                        node as any,
                        'dynamic-worklet-processor'
                    );
                    await dynamicWorkletNode.createWorklet();
                    this.virtualNodes.set(node.id, dynamicWorkletNode);
                    break;
                case "NoiseFlowNode":
                    // Treat like a specialized audio worklet source (no input), ensure processorCode exists
                    if (!(node.data as any).processorCode) {
                        const noiseType = (node.data as any).noiseType || 'white';
                        const gain = typeof (node.data as any).gain === 'number' ? (node.data as any).gain : 1;
                        (node.data as any).processorCode = `class ExtendAudioWorkletProcessor extends AudioWorkletProcessor {\n  constructor(){super();this._pinkState=new Float32Array(7);this._brown=0;this._grayLast=0;}\n  static get parameterDescriptors(){return[{name:'gain',defaultValue:${gain},minValue:0,maxValue:4,automationRate:'a-rate'}];}\n  process(inputs,outputs,parameters){const out=outputs[0];if(!out)return true;const gArr=parameters.gain;const gScalar=gArr.length===1?gArr[0]:null;for(let ch=0;ch<out.length;ch++){const buf=out[ch];for(let i=0;i<buf.length;i++){const g=gScalar!==null?gScalar:gArr[i];let sample=0;switch('${noiseType}') {case 'white': sample=(Math.random()*2-1);break;case 'pink':{let ps=this._pinkState;ps[0]=0.99886*ps[0]+Math.random()*0.0555179;ps[1]=0.99332*ps[1]+Math.random()*0.0750759;ps[2]=0.96900*ps[2]+Math.random()*0.1538520;ps[3]=0.86650*ps[3]+Math.random()*0.3104856;ps[4]=0.55000*ps[4]+Math.random()*0.5329522;ps[5]=-0.7616*ps[5]-Math.random()*0.0168980;sample=ps[0]+ps[1]+ps[2]+ps[3]+ps[4]+ps[5]+ps[6]+Math.random()*0.5362;ps[6]=Math.random()*0.115926;sample*=0.11;break;}case 'brown':{this._brown+=(Math.random()*2-1)*0.02;if(this._brown<-1)this._brown=-1;else if(this._brown>1)this._brown=1;sample=this._brown;break;}case 'blue':{const w1=(Math.random()*2-1);const w2=(Math.random()*2-1);sample=(w2-w1);break;}case 'violet':{const w1=(Math.random()*2-1);const w2=(Math.random()*2-1);const w3=(Math.random()*2-1);sample=(w3-2*w2+w1);break;}case 'gray':{const white=(Math.random()*2-1);this._grayLast=0.97*this._grayLast+0.03*white;sample=this._grayLast;break;}}buf[i]=sample*g*0.5;}}return true;}\n}`;
                    }
                    //ADDD TODO HERE NEXT TIME ADD NODEMAPS TO CONNECT TO NODES AGAIN AFTER RESETTING NODE.
                    const noiseWorkletNode = new VirtualAudioWorkletNode(
                        this.audioContext,
                        this.eventBus,
                        node as any,
                        `noise-worklet-processor-${node.id}`
                    );
                    await noiseWorkletNode.createWorklet();
                    this.virtualNodes.set(node.id, noiseWorkletNode);
                    break;
                case "ButtonFlowNode":
                    const virtualButtonNode = new VirtualButtonNode(
                        this.eventManager,
                        this.eventBus,
                        node
                    );
                    virtualButtonNode.render((node as ButtonNodeProps).data.assignedKey);
                    virtualButtonNode.subscribeOnOff(
                        (data) => this.emitEventsForConnectedEdges(node, data, "receiveNodeOn"),
                        (data) => this.emitEventsForConnectedEdges(node, data, "receiveNodeOff")
                    );
                    this.virtualNodes.set(node.id, virtualButtonNode);
                    break;
                case "MidiButtonFlowNode":
                    const virtualMidiButtonNode = new VirtualMidiButtonNode(
                        this.eventManager,
                        this.eventBus,
                        node as CustomNode & MidiButtonNodeProps
                    );
                    virtualMidiButtonNode.render();
                    virtualMidiButtonNode.subscribeOnOff(
                        (data) => this.emitEventsForConnectedEdges(node, data, "receiveNodeOn"),
                        (data) => this.emitEventsForConnectedEdges(node, data, "receiveNodeOff")
                    );
                    this.virtualNodes.set(node.id, virtualMidiButtonNode);
                    break;
                case "OnOffButtonFlowNode":
                    // Virtual gating node: passes main-input events only when toggle gate is ON
                    const virtualOnOff = new VirtualOnOffButtonNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    // Forward sendNodeOn/Off from virtual to connected edges
                    virtualOnOff.setSendNodeOn((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
                    virtualOnOff.setSendNodeOff((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
                    this.virtualNodes.set(node.id, virtualOnOff);
                    break;
                case "SpeedDividerFlowNode":
                    const virtualSpeedDivider = new VirtualSpeedDividerNode(
                        this.eventBus,
                        node as any
                    );
                    virtualSpeedDivider.setSendNodeOn((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
                    virtualSpeedDivider.setSendNodeOff((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
                    // Listen for incoming value objects and forward to correct handle
                    this.eventBus.subscribe(node.id + '.divider-input.receiveNodeOn', (payload: any) => {
                        // Only forward value to divider
                        virtualSpeedDivider['divider'] = typeof payload.value === 'number' ? Math.max(1, Math.min(10, payload.value)) : virtualSpeedDivider['divider'];
                        virtualSpeedDivider['hitCount'] = 0;
                        virtualSpeedDivider['emitHitCount'] && virtualSpeedDivider['emitHitCount']();
                    });
                    this.eventBus.subscribe(node.id + '.multiplier-input.receiveNodeOn', (payload: any) => {
                        // Only forward value to multiplier
                        virtualSpeedDivider['multiplier'] = typeof payload.value === 'number' ? Math.max(1, Math.min(10, payload.value)) : virtualSpeedDivider['multiplier'];
                    });
                    this.virtualNodes.set(node.id, virtualSpeedDivider);
                    break;
                case "AudioSignalFreqShifterFlowNode":
                    const virtualAudioFreqShifter = new VirtualAudioSignalFreqShifterNode(
                        this.audioContext,
                        this.eventBus,
                        node as CustomNode & AudioSignalFreqShifterFlowNodeProps
                    );
                    virtualAudioFreqShifter.render(nodeData.shift || 0);
                    this.virtualNodes.set(node.id, virtualAudioFreqShifter);
                    break;
                case "FlowEventFreqShifterFlowNode":
                    const virtualFlowEventFreqShifter = new VirtualFlowEventFreqShifterNode(
                        this.eventBus,
                        node as CustomNode & FlowEventFreqShifterFlowNodeProps
                    );
                    virtualFlowEventFreqShifter.setSendNodeOn((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
                    virtualFlowEventFreqShifter.setSendNodeOff((data) => this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
                    virtualFlowEventFreqShifter.render(nodeData.shift || 0);
                    this.virtualNodes.set(node.id, virtualFlowEventFreqShifter);
                    break;
                case "ClockFlowNode":
                    const virtualClockNode = new VirtualClockNode(
                        this.eventBus,
                        node,
                        this.emitEventsForConnectedEdges.bind(this)
                    );
                    virtualClockNode.render((node as ClockNodeProps).data.bpm);
                    this.virtualNodes.set(node.id, virtualClockNode);
                    break;
                case "SwitchFlowNode":
                    const virtualSwitchNode = new VirtualSwitchNode(
                        this.eventBus,
                        node
                    );
                    virtualSwitchNode.render();
                    virtualSwitchNode.setSendNodeOn((data) => {
                        this.handleSendNodeEventSwitch(node, data, "receiveNodeOn");
                    });
                    this.virtualNodes.set(node.id, virtualSwitchNode);
                    break;
                case "BlockingSwitchFlowNode":
                    const virtualBlockingSwitchNode = new VirtualBlockingSwitchNode(
                        this.eventBus,
                        node
                    );
                    virtualBlockingSwitchNode.setSendNodeOn((data) => {
                        this.handleSendNodeEventSwitch(node, data, "receiveNodeOn");
                    });
                    virtualBlockingSwitchNode.setSendNodeOff((data) => {
                        this.handleSendNodeEventSwitch(node, data, "receiveNodeOff");
                    });
                    this.virtualNodes.set(node.id, virtualBlockingSwitchNode);
                    break;

                case "ConstantFlowNode":
                    const virtualConstantNode = new VirtualConstantNode(
                        this.eventBus,
                        node as CustomNode & ConstantNodeProps,
                        (node as ConstantNodeProps).data.value || 0,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualConstantNode);
                    break;
                case "FrequencyFlowNode":
                    const virtualFrequencyNode = new VirtualFrequencyNode(
                        this.eventBus,
                        node as CustomNode & FrequencyFlowNodeProps,
                        (node as FrequencyFlowNodeProps).data.frequency || 440,
                        (node as FrequencyFlowNodeProps).data.frequencyType || "hz",
                        (node as FrequencyFlowNodeProps).data.knobValue || 0,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualFrequencyNode);
                    break;
                case "MidiFlowNote":
                    const virtualMidiNode = new VirtualMidiNode(node.id, node.id);
                    // Listen to virtual node emission and forward to connected edges
                    this.eventBus.subscribe(`${node.id}.main-input.sendNodeOn`, (payload: any) => {
                        this.handleConnectedEdges({ id: node.id, type: node.type, data: node.data } as any, { value: payload.value, frequency: payload.frequency, note: payload.note }, "receiveNodeOn");
                    });
                    this.eventBus.subscribe(`${node.id}.main-input.sendNodeOff`, (payload: any) => {
                        this.handleConnectedEdges({ id: node.id, type: node.type, data: node.data } as any, { value: payload.value, frequency: payload.frequency, note: payload.note }, "receiveNodeOff");
                    });

                    // Forward per-message-type events from MidiFlowNote (note-on, note-off, CC, etc.)
                    const forward = (eventId: string) => {
                        this.eventBus.subscribe(`${node.id}.${eventId}.sendNodeOn`, (payload: any) => {
                            this.handleConnectedEdges({ id: node.id, type: node.type, data: node.data } as any, payload, "receiveNodeOn", eventId);
                        });
                        this.eventBus.subscribe(`${node.id}.${eventId}.sendNodeOff`, (payload: any) => {
                            this.handleConnectedEdges({ id: node.id, type: node.type, data: node.data } as any, payload, "receiveNodeOff", eventId);
                        });
                    };

                    ['note-on', 'note-off', 'control-change', 'program-change', 'poly-aftertouch', 'channel-aftertouch', 'pitch-bend', 'sysex', 'mtc', 'song-position', 'song-select', 'tune-request', 'clock'].forEach(forward);
                    this.virtualNodes.set(node.id, virtualMidiNode as any);
                    break;
                case "FunctionFlowNode":
                    const virtualFunctionNode = new VirtualFunctionNode(
                        this.eventBus,
                        node as CustomNode & FunctionNodeProps,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualFunctionNode);
                    break;
                case "EventFlowNode":
                    const virtualEventNode = new VirtualEventNode(
                        this.eventBus,
                        node as any,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualEventNode as any);
                    break;
                case "MidiKnobFlowNode":
                    const virtualMidiKnob = new VirtualMidiKnobNode(
                        this.eventBus,
                        node as any,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualMidiKnob as any);
                    break;
                case "LogFlowNode":
                    const virtualLogNode = new VirtualLogNode(
                        this.eventBus,
                        node as any
                    );
                    this.virtualNodes.set(node.id, virtualLogNode as any);
                    break;
                case "ADSRFlowNode":
                    const virtualADSRNode = new VirtualADSRNode(
                        this.eventBus,
                        node as CustomNode & ADSRFlowNodeProps,
                        this.handleConnectedEdgesADSRNodeOff.bind(this),
                        this.handleConnectedEdgesADSRNodeOn.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualADSRNode);
                    break;
                case "FlowNode":
                    const customNode = await this.loadFlowByName(
                        (node as any).data.selectedNode
                    );
                    if (!customNode) {
                        console.warn(
                            'FlowNode: sub-flow not found:',
                            (node as any).data.selectedNode
                        );
                        break;
                    }
                    const edges = customNode.edges;
                    for (const n of customNode.nodes) {
                        await this.addVirtualNode(n as any, node);
                    }
                    for (const edge of edges) {
                        edge.source = node.id + "." + edge.source;
                        edge.target = node.id + "." + edge.target;
                    }
                    this.connectVirtualNodes(edges);
                    const virtualFlowNode = new VirtualFlowNode(
                        this.eventBus,
                        node as CustomNode & FlowNodeProps,
                        this.handleConnectedEdgesFromOutput.bind(this),
                        customNode,
                    );
                    // Virtual Flow Node created
                    this.virtualNodes.set(node.id, virtualFlowNode);
                    break;
                case "InputNode":
                    const virtualInputNode = new VirtualInputNode(
                        this.eventBus,
                        node as CustomNode & InputNodeProps,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualInputNode);
                    break;
                case "OutputNode":

                    const virtualOutputNode = new VirtualOutputNode(
                        this.eventBus,
                        node as CustomNode & OutputNodeProps,
                        this.handleConnectedEdges.bind(this)
                    );
                    this.virtualNodes.set(node.id, virtualOutputNode);
                    // Virtual Output Node created
                    const edge: Edge = {
                        id: node.id + ".main-input",
                        source: node.id,
                        target: parentNode ? parentNode.id : null,
                        sourceHandle: "main-input",
                        targetHandle: "output-" + (node as CustomNode & OutputNodeProps).data.index,
                    };
                    this.virtualEdges.set(
                        node.id,
                        this.sortEdges([
                            ...this.virtualEdges.get(node.id)
                            || [],
                            edge
                        ])
                    );

                    break;
                case "MouseTriggerButton":
                    const virtualMouseTrigger = new VirtualMouseTriggerButtonNode(
                        this.eventBus,
                        node as any
                    );
                    virtualMouseTrigger.render();
                    // Forward events to connected edges
                    this.eventBus.subscribe(node.id + '.main-input.sendNodeOn', (data: any) => {
                        this.emitEventsForConnectedEdges(node, data, 'receiveNodeOn');
                    });
                    this.eventBus.subscribe(node.id + '.main-input.sendNodeOff', (data: any) => {
                        this.emitEventsForConnectedEdges(node, data, 'receiveNodeOff');
                    });
                    this.virtualNodes.set(node.id, virtualMouseTrigger as any);
                    break;
                case "RecordingFlowNode":
                    const virtualRecording = new VirtualRecordingNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    virtualRecording.render();
                    this.virtualNodes.set(node.id, virtualRecording as any);
                    break;
                case "MicFlowNode":
                    const virtualMic = new VirtualMicNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    await virtualMic.render();
                    this.virtualNodes.set(node.id, virtualMic as any);
                    break;
                case "WebRTCInputFlowNode":
                    const virtualWebRTCIn = new VirtualWebRTCInputNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    await virtualWebRTCIn.render();
                    this.virtualNodes.set(node.id, virtualWebRTCIn as any);
                    break;
                case "WebRTCOutputFlowNode":
                    const virtualWebRTCOut = new VirtualWebRTCOutputNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    await virtualWebRTCOut.render();
                    this.virtualNodes.set(node.id, virtualWebRTCOut as any);
                    break;
                case "WebRTCPulseNode":
                    // Creating VirtualWebRTCPulseNode
                    const virtualWebRTC = new VirtualWebRTCPulseNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    await virtualWebRTC.render();
                    this.virtualNodes.set(node.id, virtualWebRTC as any);
                    // VirtualWebRTCPulseNode created and stored
                    break;
                case "WebSocketAudioNode":
                    const virtualWebSocket = new VirtualWebSocketAudioNode(
                        this.audioContext,
                        this.eventBus,
                        node as any
                    );
                    await virtualWebSocket.render();
                    this.virtualNodes.set(node.id, virtualWebSocket as any);
                    break;
                default:
                    console.warn(`Unsupported node type: ${node.type}`);
            }
        }
    }
    /**
     * Creates Web Audio nodes based on the provided nodes.
     * @param nodes - Array of React Flow nodes.
     */
    async createVirtualNodes(nodes: Node[], parentNode: CustomNode | null) {
        for (const node of nodes) {
            if (parentNode) {
                await this.addVirtualNode(node as CustomNode, parentNode);
            } else {
                await this.addVirtualNode(node as CustomNode, null);
            }
        }
    }

    //Fixme
    public async updateEdges() {
        this.virtualNodes.forEach((node) => {
            if (node instanceof AudioNode) {
                node.disconnect();
                this.disconnectFromMaps(node.id);
            }
        });

        // Reset virtualEdges correctly as a Map (was incorrectly set to an array, breaking .get/.set usage)
        this.virtualEdges = new Map<string, Edge[]>();

        for (let i = 0; i < this.nodesRef.current.length; i++) {
            const node = this.nodesRef.current[i] as CustomNode;
            const nodeId = node.id;
            if (node.type === "FlowNode") {
                const customNodeId = (node as FlowNodeProps).data.selectedNode as string;
                if (customNodeId) {
                    const flowData = await this.loadFlowByName(customNodeId);
                    if (flowData && flowData.edges) {
                        const edgesWithNewId = flowData.edges.map(
                            (edge: Edge) => ({
                                ...edge,
                                source: `${nodeId}.${edge.source}`,
                                target: `${nodeId}.${edge.target}`,
                            })
                        );
                        this.virtualEdges.set(
                            nodeId,
                            this.sortEdges(edgesWithNewId)
                        );
                    }
                }
            }
        }


        // Add all current edges to the virtualEdges map, grouped by source node id
        this.edgesRef.current.forEach((edge: Edge) => {
            this.virtualEdges.set(edge.source, []);
        });


        this.edgesRef.current.forEach((edge: Edge) => {
            this.addConnection(edge);
        });

    }

    public resetConnectionsOfNode(nodeId: string) {
        const edges = this.getEdgesOfNode(nodeId);
        const node = this.virtualNodes.get(nodeId)?.audioNode;
        edges.forEach((edge) => {
            this.addConnection(edge);
        });
    }

    public getEdgesOfNode(nodeId: string): Edge[] {
        const edges = this.edgesRef.current.filter((edge) => edge.source === nodeId || edge.target === nodeId);
        return edges;
    }

    addMapConnections(sourceId: string, targetId: string) {
        if (this.sourceNodeMapConnectionTree.has(sourceId)) {
            this.sourceNodeMapConnectionTree.get(sourceId)!.add(targetId);
        } else {
            this.sourceNodeMapConnectionTree.set(sourceId, new Set([targetId]));
        }
        if (this.targetNodeMapConnectionTree.has(targetId)) {
            this.targetNodeMapConnectionTree.get(targetId)!.add(sourceId);
        } else {
            this.targetNodeMapConnectionTree.set(targetId, new Set([sourceId]));
        }
    }

    public addConnection(edge: Edge) {
        // edge.source is the id of the source node in the audioNodes map
        // We'll allow remapping when a CustomNode is involved so external connections actually wire the
        // internal audio nodes adjacent to Input/Output nodes of the custom template.
        //console.log('[AudioGraphManager] addConnection called for edge:', edge);
        let originalEdge = edge
        let sourceId = edge.source;;
        let targetId = edge.target;
        let sourceHandle = edge.sourceHandle as string | undefined;
        let targetHandle = edge.targetHandle as string | undefined;

        const isCustom = (id: string | undefined) => !!id && id.split(".").includes("FlowNode");
        const getNodeType = (id: string | undefined) => id ? id.split(".").slice(-1)[0] : undefined;

        // Helper: fetch internal definition for a custom node (nodes+edges) from DB cache already expanded in virtual graph
        const getInternalGraph = (customNodeId: string): { nodes: any[]; edges: Edge[] } | null => {
            const virtualCustom = this.virtualNodes.get(customNodeId) as any; // VirtualCustomNode
            if (!virtualCustom) return null;
            const baseNode = this.nodesRef.current.find((n: any) => n.id === customNodeId);
            const selectedId = baseNode?.data?.selectedNode;
            if (!selectedId) return null;
            const internalNodes: any[] = [];
            this.virtualNodes.forEach((vNode: any, vid: string) => {
                if (vid.startsWith(customNodeId + ".") && vid !== customNodeId) {
                    // push a pseudo node object capturing id and data/type
                    internalNodes.push({ id: vid, type: getNodeType(vid), data: vNode?.node?.data || {} });
                }
            });
            const internalEdges: Edge[] = [];
            this.virtualEdges.forEach((edges, sid) => {
                if (sid.startsWith(customNodeId + ".")) {
                    edges.forEach(e => {
                        if (e.source.startsWith(customNodeId + ".") && e.target.startsWith(customNodeId + ".")) {
                            internalEdges.push(e);
                        }
                    });
                }
            });
            return { nodes: internalNodes, edges: internalEdges };
        };

        // Remap when source is a FlowNode external output
        try {
            if (isCustom(sourceId) && sourceHandle && sourceHandle.startsWith("output-")) {
                const outputIndex = parseInt(sourceHandle.replace("output-", ""), 10);
                const parts = sourceId.split(".");
                const customIdx = parts.indexOf("FlowNode");
                const customRootId = customIdx >= 0 ? parts.slice(0, customIdx + 1).join(".") : sourceId;
                const graph = getInternalGraph(customRootId);
                if (graph) {
                    // Find internal OutputNode with matching data.index
                    const internalOutput = graph.nodes.find(n => n.type === 'OutputNode' && n.data?.index === outputIndex);
                    if (internalOutput) {
                        // Find node feeding this OutputNode: edge where target == internalOutput.id and targetHandle == 'input'
                        const inEdge = graph.edges.find(e => e.target === internalOutput.id && (e.targetHandle === 'input' || e.targetHandle === 'main-input'));
                        if (inEdge) {
                            // Use the source of that internal edge as the real audio source node
                            sourceId = inEdge.source;
                            sourceHandle = inEdge.sourceHandle as string | undefined; // often 'main-input'
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('FlowNode source remap failed', err, originalEdge);
        }

        // Remap when target is a FlowNode external input
        try {
            if (isCustom(targetId) && targetHandle && targetHandle.startsWith("input-")) {
                const inputIndex = parseInt(targetHandle.replace("input-", ""), 10);
                const parts = targetId.split(".");
                const customIdx = parts.indexOf("FlowNode");
                const customRootId = customIdx >= 0 ? parts.slice(0, customIdx + 1).join(".") : targetId;
                const graph = getInternalGraph(customRootId);
                if (graph) {
                    // Find internal InputNode with matching data.index
                    const internalInput = graph.nodes.find(n => n.type === 'InputNode' && n.data?.index === inputIndex);
                    if (internalInput) {
                        // Find first edge where source == internalInput.id (internalInput -> downstream node)
                        const outEdges = graph.edges.filter(e => e.source === internalInput.id);
                        if (outEdges.length > 0) {
                            for (const outEdge of outEdges) {
                                // Connect to each downstream node
                                this.connectSourceToTarget(
                                    sourceId,
                                    outEdge.target,
                                    sourceHandle,
                                    outEdge.targetHandle,
                                    edge
                                );
                            }
                            return;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('FlowNode target remap failed', err, originalEdge);
        }

        this.connectSourceToTarget(sourceId, targetId, sourceHandle, targetHandle, edge, originalEdge);
    }

    connectSourceToTarget(
        sourceId: string,
        targetId: string,
        sourceHandle: string | undefined,
        targetHandle: string | undefined,
        edge: Edge,
        originalEdge: Edge
    ) {
        const sourceVirtual: any = this.virtualNodes.get(sourceId);
        const targetVirtual: any = this.virtualNodes.get(targetId);

        const resolveOutputNode = (virtual: any): AudioNode | undefined => {
            if (!virtual) return undefined;
            if (typeof virtual.getOutputNode === 'function') return virtual.getOutputNode();
            if (virtual instanceof AudioNode) return virtual as AudioNode;
            return virtual.audioNode as AudioNode | undefined;
        };

        const resolveInputNode = (virtual: any, fallback: AudioNode | undefined): AudioNode | undefined => {
            if (!virtual) return fallback;
            if (typeof virtual.getInputNode === 'function') return virtual.getInputNode();
            if (virtual instanceof AudioNode) return virtual as AudioNode;
            return fallback;
        };

        const parseWorkletParamHandle = (handle?: string): { mode: 'stream' | 'flow'; paramId: string } | null => {
            if (!handle || !handle.startsWith('param-')) return null;
            if (handle.startsWith('param-flow-')) {
                return { mode: 'flow', paramId: handle.slice('param-flow-'.length) };
            }
            if (handle.startsWith('param-stream-')) {
                return { mode: 'stream', paramId: handle.slice('param-stream-'.length) };
            }
            return { mode: 'stream', paramId: handle.slice('param-'.length) };
        };

        const sourceNode: AudioNode | undefined = resolveOutputNode(sourceVirtual);
        const targetNodeForParams: AudioNode | AudioContext | undefined = (() => {
            if (!targetVirtual) return undefined;
            if (typeof targetVirtual.getOutputNode === 'function') return targetVirtual.getOutputNode();
            if (targetVirtual instanceof AudioNode || targetVirtual instanceof AudioContext) return targetVirtual;
            return targetVirtual.audioNode as AudioNode | undefined;
        })();
        let targetInputNode: AudioNode | undefined = resolveInputNode(targetVirtual, targetNodeForParams instanceof AudioNode ? targetNodeForParams : undefined);
        // Removed premature ADSR minPercent initialization; envelope sets values on trigger.

        const targetNode: any = targetNodeForParams as any;

        if (edge.source.split(".").includes("ADSRFlowNode")) {
            if (targetNode && targetNode[targetHandle] instanceof AudioParam) {
                const sourceCustom = this.nodesRef.current.find((n: any) => n.id === edge.source);
                const minPercent = (sourceCustom?.data?.minPercent ?? 0) / 100;
                const baseValue = (this.nodesRef.current.find((n: any) => n.id === edge.target)?.data?.[targetHandle]) || 1;
                targetNode[targetHandle].value = baseValue * minPercent;
            }
        }
        const targetParamHandle = targetHandle;

        if (sourceNode && targetNodeForParams) {
            // 1. Standard audio -> audio connection
            if (targetVirtual && typeof targetVirtual.connectHandleNames === 'object' && Array.isArray(targetVirtual.connectHandleNames) && targetVirtual.connectHandleNames.includes(targetParamHandle)) {
                // Handle named input handles for VirtualAudioWorkletOscillatorNode
                try {
                    targetVirtual.connectToInput(sourceNode, targetParamHandle);
                    this.addMapConnections(sourceId, targetId);
                } catch (e) {
                    console.warn('[connect] failed node->named input handle', { sourceId, targetId, targetParamHandle, e });
                }
            } else if (targetParamHandle === "main-input") {
                try {
                    try {
                        if (targetVirtual instanceof VirtualOscilloscopeNode) {
                            console.log("ensuring oscilloscope loop for node", targetId);
                            (targetVirtual as VirtualOscilloscopeNode).ensureLoop();
                            targetInputNode = (targetVirtual as VirtualOscilloscopeNode).audioNode as AudioNode;
                        }
                    } catch (e) { /* noop */ }
                    const inputNode = targetInputNode ?? (targetNodeForParams as AudioNode);
                    if (!inputNode) {
                        throw new Error('Target input node unavailable');
                    }
                    sourceNode.connect(inputNode);
                    this.addMapConnections(sourceId, targetId);
                    // If target is an oscilloscope, ensure its RAF loop is running so UI starts receiving data

                } catch (e) {
                    console.warn('[connect] failed node->node', { sourceId, targetId, e });
                }
                // 2. Destination (AudioContext)
            } else if (targetParamHandle === "destination-input") {
                if (targetNodeForParams instanceof AudioContext && sourceNode instanceof AudioNode) {
                    try {
                        sourceNode.connect(targetNodeForParams.destination);
                        this.addMapConnections(sourceId, targetId);
                    } catch (e) {
                        console.warn('[connect] failed node->context.destination', { sourceId, e });
                    }
                }
                // 3. Audio -> AudioParam modulation (frequency, gain, detune, etc.)
            } else if (targetParamHandle) {
                let workletParam;
                if (targetVirtual instanceof VirtualAudioWorkletNode) {
                    workletParam = parseWorkletParamHandle(targetParamHandle);
                } else if (targetVirtual instanceof VirtualAudioWorkletOscillatorNode) {
                    workletParam = { paramId: targetParamHandle, mode: 'stream' };
                } else {
                    workletParam = null;
                }
                if ((targetVirtual instanceof VirtualAudioWorkletNode || targetVirtual instanceof VirtualAudioWorkletOscillatorNode) && workletParam) {
                    const mapKey = targetId + ':' + targetParamHandle;

                    const existing = this.sourceNodeMapConnectionTree.get(sourceId);
                    if (!existing || !existing.has(mapKey)) {
                        if (targetVirtual instanceof VirtualAudioWorkletNode && workletParam.mode === 'stream') {
                            targetVirtual.registerParamConnection(sourceNode, workletParam.paramId);
                        } else if (targetVirtual instanceof VirtualAudioWorkletOscillatorNode && workletParam.mode === 'stream') {
                            targetVirtual.connectToInput(sourceNode, workletParam.paramId);
                        }

                        if (!this.sourceNodeMapConnectionTree.has(sourceId)) {
                            this.sourceNodeMapConnectionTree.set(sourceId, new Set([mapKey]));
                        } else {
                            this.sourceNodeMapConnectionTree.get(sourceId)!.add(mapKey);
                        }
                        if (!this.targetNodeMapConnectionTree.has(mapKey)) {
                            this.targetNodeMapConnectionTree.set(mapKey, new Set([sourceId]));
                        } else {
                            this.targetNodeMapConnectionTree.get(mapKey)!.add(sourceId);
                        }
                    }
                } else {
                    const maybeParam: any = (targetNodeForParams as any)[targetParamHandle];
                    if (maybeParam instanceof AudioParam) {
                        try {
                            // Avoid duplicate connections by simple heuristic: check internal maps
                            const existing = this.sourceNodeMapConnectionTree.get(sourceId);
                            const mapKey = targetId + ':' + targetParamHandle;
                            if (!existing || !existing.has(mapKey)) {
                                (sourceNode as any).connect(maybeParam);
                                // Track connection with param-specific key to prevent duplicate modulation stacking
                                if (!this.sourceNodeMapConnectionTree.has(sourceId)) {
                                    this.sourceNodeMapConnectionTree.set(sourceId, new Set([mapKey]));
                                } else {
                                    this.sourceNodeMapConnectionTree.get(sourceId)!.add(mapKey);
                                }
                                if (!this.targetNodeMapConnectionTree.has(mapKey)) {
                                    this.targetNodeMapConnectionTree.set(mapKey, new Set([sourceId]));
                                } else {
                                    this.targetNodeMapConnectionTree.get(mapKey)!.add(sourceId);
                                }
                            }
                        } catch (e) {
                            console.warn('[connect] failed node->param', { sourceId, targetId, targetParamHandle, e });
                        }
                    } else if (targetVirtual instanceof VirtualAudioWorkletNode) {
                        const paramFromName = typeof targetParamHandle === 'string' ? targetVirtual.getParameterByName(targetParamHandle) : undefined;
                        if (paramFromName instanceof AudioParam && sourceNode instanceof AudioNode) {
                            try {
                                const mapKey = targetId + ':' + targetParamHandle;
                                const existing = this.sourceNodeMapConnectionTree.get(sourceId);
                                if (!existing || !existing.has(mapKey)) {
                                    sourceNode.connect(paramFromName);
                                    if (!this.sourceNodeMapConnectionTree.has(sourceId)) {
                                        this.sourceNodeMapConnectionTree.set(sourceId, new Set([mapKey]));
                                    } else {
                                        this.sourceNodeMapConnectionTree.get(sourceId)!.add(mapKey);
                                    }
                                    if (!this.targetNodeMapConnectionTree.has(mapKey)) {
                                        this.targetNodeMapConnectionTree.set(mapKey, new Set([sourceId]));
                                    } else {
                                        this.targetNodeMapConnectionTree.get(mapKey)!.add(sourceId);
                                    }
                                }
                            } catch (e) {
                                console.warn('[connect] failed node->worklet param by name', { sourceId, targetId, targetParamHandle, e });
                            }
                        }
                    }
                }
            }
        }
        // Store edge under possibly remapped source id (so events propagate from true internal audio source)
        //"xy-edge__af24561f-4ad3-4088-815f-8304a4a9c743.ButtonFlowNodeoutput-341a8205-21ff-44df-aa98-94ac0695e4bc.FlowNodeinput-0"
        const normalizedEdge = { ...edge, id: "xy-edge__" + sourceId + sourceHandle + "-" + targetId + targetHandle, source: sourceId, target: targetId, sourceHandle, targetHandle };
        //Reset id of normalizedEdge to avoid confusionn m mm,kl

        // If edge was remapped, remove the original edge first
        const wasRemapped = originalEdge.source !== sourceId || originalEdge.target !== targetId;
        if (wasRemapped) {
            const originalSourceEdges = this.virtualEdges.get(originalEdge.source);
            if (originalSourceEdges) {
                const filteredEdges = originalSourceEdges.filter(
                    (e) => !(e.source === originalEdge.source && e.target === originalEdge.target && e.sourceHandle === originalEdge.sourceHandle && e.targetHandle === originalEdge.targetHandle)
                );
                if (filteredEdges.length > 0) {
                    this.virtualEdges.set(originalEdge.source, filteredEdges);
                } else {
                    this.virtualEdges.delete(originalEdge.source);
                }
            }
        }

        const existingEdges = this.virtualEdges.get(sourceId);
        if (!existingEdges) {
            this.virtualEdges.set(sourceId, [normalizedEdge]);
        } else {

            const alreadyTracked = existingEdges.some((storedEdge) => storedEdge.id === normalizedEdge.id);
            if (!alreadyTracked) {
                existingEdges.push(normalizedEdge);
                this.virtualEdges.set(sourceId, this.sortEdges(existingEdges));
            }
        }
    }

    disconnectFromMaps(nodeId: string) {
        const sourceKeysToPrune: string[] = [];
        for (const [src, targets] of this.sourceNodeMapConnectionTree.entries()) {
            const removals: string[] = [];
            targets.forEach((value) => {
                if (value === nodeId || (typeof value === 'string' && value.startsWith(`${nodeId}:`))) {
                    removals.push(value);
                }
            });
            removals.forEach(value => targets.delete(value));
            if (targets.size === 0) {
                sourceKeysToPrune.push(src);
            }
        }
        sourceKeysToPrune.forEach(key => this.sourceNodeMapConnectionTree.delete(key));

        const targetKeysToPrune: string[] = [];
        for (const [tgt, sources] of this.targetNodeMapConnectionTree.entries()) {
            if (tgt === nodeId || (typeof tgt === 'string' && tgt.startsWith(`${nodeId}:`))) {
                targetKeysToPrune.push(tgt);
                continue;
            }
            if (sources.has(nodeId)) {
                sources.delete(nodeId);
                if (sources.size === 0) targetKeysToPrune.push(tgt);
            }
        }
        targetKeysToPrune.forEach(key => this.targetNodeMapConnectionTree.delete(key));
    }

    public deleteVirtualNode(nodeId: string) {
        const audioNode = this.virtualNodes.get(nodeId);

        this.eventBus.unsubscribeAllByNodeId(nodeId);
        if (audioNode) {
            // Remove nodeId from all sets in sourceNodeMapConnectionTree and targetNodeMapConnectionTree
            if (audioNode.dispose) audioNode.dispose();
            (audioNode as any).disconnect?.();
            this.disconnectFromMaps(nodeId);
            this.virtualNodes.delete(nodeId);
            //console.log("Deleted node:", nodeId);
        } else {
            console.warn(`Node with ID ${nodeId} not found.`);
        }
    }

    public deleteEdge(edge: Edge | undefined) {
        if (!edge) {
            console.warn("Edge is undefined.");
            return;
        }
        const sourceNode = this.virtualNodes.get(edge.source);
        const targetNode = this.virtualNodes.get(edge.target);
        if (sourceNode && targetNode) {
            if (targetNode instanceof VirtualAudioWorkletNode && typeof edge.targetHandle === 'string' && edge.targetHandle.startsWith('param-')) {
                const sourceVirtual: any = sourceNode;
                const outputNode: AudioNode | undefined = typeof sourceVirtual.getOutputNode === 'function'
                    ? sourceVirtual.getOutputNode()
                    : (sourceVirtual instanceof AudioNode ? sourceVirtual : sourceVirtual.audioNode);
                if (outputNode instanceof AudioNode) {
                    const paramId = edge.targetHandle.slice('param-'.length);
                    targetNode.unregisterParamConnection(outputNode, paramId);
                }
            }
            // Disconnect the nodes
            (sourceNode as any).disconnect?.(targetNode);
            const mapKey = edge.targetHandle ? `${edge.target}:${edge.targetHandle}` : edge.target;
            this.sourceNodeMapConnectionTree.get(edge.source)?.delete(mapKey);
            const targetSet = this.targetNodeMapConnectionTree.get(mapKey);
            targetSet?.delete(edge.source);
            if (targetSet && targetSet.size === 0) {
                this.targetNodeMapConnectionTree.delete(mapKey);
            }
            // console.log("Deleted edge:", edge.source, "to", edge.target);
        } else {
            console.warn(`Edge ${edge.source} to ${edge.target} not found.`);
        }
    }

    connectVirtualNodes(edges: Edge[], first = true) {
        edges.forEach((edge) => {
            this.addConnection(edge);
        });
    }
}