// @ts-nocheck
import { SynNode as Node, SynEdge as Edge } from "./types";
import EventBus from "./EventBus";
import type { EngineOptions } from "./env";
import { SimpleIndexedDB } from "../../../src/util/SimpleIndexedDB";
import EventManager from "../../../src/sys/EventManager";
import { VirtualAudioWorkletNode } from "./virtualNodes/VirtualAudioWorkletNode";
import VirtualOscilloscopeNode from "./virtualNodes/VirtualOscilloscopeNode";
import VirtualAudioWorkletOscillatorNode from "./virtualNodes/VirtualAudioWorkletOscillatorNode";
import VirtualClockNode from "./virtualNodes/VirtualClockNode";
import {
    loadRootHandle,
    loadFlowFromDisk,
    makeFlowDbKey,
} from "../../../src/util/FileSystemAudioStore";

import {
    DataBaseNode,
    CustomNode,
    ExtendedOscillatorNode,
    VirtualNodeType,
    webAudioApiFlowNodes,
} from "./AudioGraphTypes";

import { addVirtualNode as _addVirtualNode } from "./VirtualNodeFactory";

import {
    emitEventsForConnectedEdges as _emitEventsForConnectedEdges,
    handleSendNodeEventSwitch as _handleSendNodeEventSwitch,
    handleSendNodeEventByHandle as _handleSendNodeEventByHandle,
    handleReceiveNodeOnCustom as _handleReceiveNodeOnCustom,
    handleReceiveNodeOffCustom as _handleReceiveNodeOffCustom,
    handleReceiveOutput as _handleReceiveOutput,
    handleEdgeADSR as _handleEdgeADSR,
    handleConnectedEdgesADSRNodeOn as _handleConnectedEdgesADSRNodeOn,
    handleConnectedEdgesAutomationNodeOn as _handleConnectedEdgesAutomationNodeOn,
    handleConnectedEdgesAutomationNodeOff as _handleConnectedEdgesAutomationNodeOff,
    handleConnectedEdgesADSRNodeOff as _handleConnectedEdgesADSRNodeOff,
    handleConnectedEdges as _handleConnectedEdges,
    handleConnectedEdgesFromOutput as _handleConnectedEdgesFromOutput,
    collectUnisonNodes as _collectUnisonNodes,
    handleButtonUpdateParam as _handleButtonUpdateParam,
} from "./AudioGraphEventHandlers";

export type { DataBaseNode, CustomNode, ExtendedOscillatorNode, VirtualNodeType };
export { webAudioApiFlowNodes };

export class AudioGraphManager {
    private audioContext: AudioContext;
    public virtualEdges: Map<string, Edge[]>;
    private eventBus: EventBus;
    private eventManager: EventManager;
    private nodesRef: React.RefObject<Node[]>;
    private edgesRef: React.RefObject<Edge[]>;
    public sourceNodeMapConnectionTree: Map<string, Set<string>> = new Map();
    public targetNodeMapConnectionTree: Map<string, Set<string>> = new Map();
    public virtualNodes: Map<string, VirtualNodeType>;
    private automationBaseParamValues: Map<string, number> = new Map();
    // Parallel id-set per source for O(1) edge-dedup on push (replaces .some()).
    private virtualEdgeIds: Map<string, Set<string>> = new Map();
    // Cache parsed node type ("a.b.OscillatorFlowNode" -> "OscillatorFlowNode")
    // to avoid repeated string splits on the event-emit / connect hot paths.
    private nodeTypeCache: Map<string, string> = new Map();
    // Memoized audio-param handle resolution, keyed per virtual-node instance.
    // WeakMap so entries auto-clear when a virtual node is replaced/GCed.
    private audioParamHandleCache: WeakMap<object, Map<string, boolean>> = new WeakMap();
    // Toggle for the verbose unison-end debug dump (was always-on in initialize).
    public static debugUnisonDump = false;
    /** Engine options (bus, destination, injected host adapters). */
    public options: EngineOptions;
    /** Where the master output connects (defaults to audioContext.destination). */
    private outputNode: AudioNode;

    constructor(
        audioContext: AudioContext,
        nodesRef: React.RefObject<any[]>,
        edgesRef: React.RefObject<any[]>,
        options: EngineOptions = {},
    ) {
        this.audioContext = audioContext;
        this.options = options;
        this.virtualNodes = new Map();
        // Shared bus: injected per host/session, or the singleton for the editor.
        this.eventBus = options.bus ?? EventBus.getInstance();
        // Master output target: injected (e.g. a DAW mixer channel) or ctx.destination.
        this.outputNode = options.destination ?? audioContext.destination;
        this.eventManager = EventManager.getInstance();
        this.db = new SimpleIndexedDB("FlowSynthDB", "flows");
        this.nodesRef = nodesRef;
        this.edgesRef = edgesRef;
        this.virtualEdges = new Map<string, Edge[]>();
        this.sourceNodeMapConnectionTree = new Map();
        this.targetNodeMapConnectionTree = new Map();

        this.createVirtualNodes = this.createVirtualNodes.bind(this);
        this.handleReceiveNodeOn = this.handleReceiveNodeOn.bind(this);
        this.handleReceiveNodeOff = this.handleReceiveNodeOff.bind(this);
        this.emitEventsForConnectedEdges = this.emitEventsForConnectedEdges.bind(this);
        this.addVirtualNode = this.addVirtualNode.bind(this);
        this.handleConnectedEdges = this.handleConnectedEdges.bind(this);
        this.handleConnectedEdgesFromOutput = this.handleConnectedEdgesFromOutput.bind(this);
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    private async loadFlowByName(
        flowName: string,
        folderPath: string = ''
    ): Promise<DataBaseNode | null> {
        try {
            const fsHandle = await loadRootHandle();
            if (fsHandle) {
                const diskFlow = await loadFlowFromDisk(fsHandle, flowName, folderPath);
                if (diskFlow) {
                    return { nodes: diskFlow.nodes || [], edges: diskFlow.edges || [] };
                }
            }
        } catch (e) {
            console.warn('[AudioGraphManager] Disk load failed for', flowName, e);
        }

        try {
            const dbKey = makeFlowDbKey(flowName, folderPath);
            const result = await this.db.get(dbKey);
            if (result && result[0]) {
                return {
                    nodes: result[0].nodes || result[0].value?.nodes || [],
                    edges: result[0].edges || result[0].value?.edges || [],
                };
            }
        } catch (e) {
            console.warn('[AudioGraphManager] DB load failed for', flowName, e);
        }

        return null;
    }

    async connectCustomNode(node: DataBaseNode, parentNode: CustomNode | null = null) {
        if (node) {
            this.connectVirtualNodes(node.edges);
        } else {
            console.warn(`Custom node with ID ${node.id} not found in IndexedDB.`);
        }
    }

    public dispose() {
        try { this.eventManager.clearButtonCallbacks(); } catch { /* noop */ }

        for (const [nodeId, node] of this.virtualNodes) {
            if (!node) continue;
            try {
                try { this.eventBus.unsubscribeAllByNodeId(nodeId); } catch { /* noop */ }

                const maybeAudio = (node as any).audioNode;
                if (maybeAudio instanceof AudioNode) {
                    try { maybeAudio.disconnect(); } catch { /* noop */ }
                }
                if (node instanceof AudioNode) {
                    try { node.disconnect(); } catch { /* noop */ }
                }
                if (typeof (node as any).dispose === 'function') {
                    try { (node as any).dispose(); } catch { /* noop */ }
                }
                try {
                    const out = typeof (node as any).getOutputNode === 'function' ? (node as any).getOutputNode() : undefined;
                    if (out instanceof AudioNode) { try { out.disconnect(); } catch { /* noop */ } }
                } catch { /* noop */ }
                try {
                    const inp = typeof (node as any).getInputNode === 'function' ? (node as any).getInputNode() : undefined;
                    if (inp instanceof AudioNode) { try { inp.disconnect(); } catch { /* noop */ } }
                } catch { /* noop */ }

                this.disconnectFromMaps(nodeId);
            } catch (e) {
                console.warn('[AudioGraphManager] dispose node failed', nodeId, e);
            }
        }

        try { this.virtualNodes.clear(); } catch { /* noop */ }
        try { this.virtualEdges = new Map<string, Edge[]>(); } catch { /* noop */ }
        try { this.sourceNodeMapConnectionTree.clear(); } catch { /* noop */ }
        try { this.targetNodeMapConnectionTree.clear(); } catch { /* noop */ }
        try { this.automationBaseParamValues.clear(); } catch { /* noop */ }
        try { this.virtualEdgeIds.clear(); } catch { /* noop */ }
        try { this.nodeTypeCache.clear(); } catch { /* noop */ }
        try { this.audioParamHandleCache = new WeakMap(); } catch { /* noop */ }
    }

    async initialize() {
        await this.createVirtualNodes(this.nodesRef.current, null);
        this.connectVirtualNodes(this.edgesRef.current);
        if (AudioGraphManager.debugUnisonDump) {
            this.debugDumpUnisonEndConnections();
        }
        // Start clocks last, so their first tick fires after all edges exist.
        this.virtualNodes.forEach((v) => {
            if (v instanceof VirtualClockNode) {
                v.startIfEmitting();
            }
        });
    }

    public debugDumpUnisonEndConnections() {
        const endIds: string[] = [];
        this.virtualNodes.forEach((_v, id) => {
            if (id.includes("UnisonEndFlowNode")) endIds.push(id);
        });
        console.log(
            `%c=== UnisonEnd connection dump === (${endIds.length} UnisonEnd node(s))`,
            "background:#a78bfa;color:#000;font-weight:bold;padding:2px 6px;"
        );
        const dump: any[] = [];
        for (const endId of endIds) {
            const incoming: Edge[] = [];
            this.virtualEdges.forEach((edges) => {
                edges.forEach((e) => { if (e.target === endId) incoming.push(e); });
            });
            const rawIncoming = this.edgesRef.current.filter((e) => e.target === endId);
            const mapSources = this.targetNodeMapConnectionTree.get(endId);
            const entry = {
                unisonEndId: endId,
                rawEdges: rawIncoming.map((e) => `${e.source} [${e.sourceHandle}] -> [${e.targetHandle}]`),
                trackedVirtualEdges: incoming.map((e) => `${e.source} [${e.sourceHandle}] -> [${e.targetHandle}]`),
                audioGraphSourcesConnected: mapSources ? [...mapSources] : [],
            };
            dump.push(entry);
            console.log(`%cUnisonEnd ${endId}`, "color:#a78bfa;font-weight:bold;", entry);
        }
        try { (window as any).__unisonDump = dump; } catch { /* noop */ }
        console.log(
            "%c>>> UnisonEnd dump stored. In console, run:  copy(window.__unisonDump)  then paste here. <<<",
            "background:#a78bfa;color:#000;font-weight:bold;padding:2px 6px;"
        );
    }

    /**
     * Trailing segment of a dotted node id (its "type"), cached. Used on hot
     * paths; a node's type never changes during its lifetime.
     */
    public getNodeTypeFromId(id: string | undefined | null): string | undefined {
        if (!id) return undefined;
        const cached = this.nodeTypeCache.get(id);
        if (cached !== undefined) return cached;
        const idx = id.lastIndexOf(".");
        const type = idx === -1 ? id : id.slice(idx + 1);
        this.nodeTypeCache.set(id, type);
        return type;
    }

    public isAudioParamTargetHandle(
        targetNodeId: string,
        targetNodeHandle: string | null | undefined
    ): boolean {
        if (!targetNodeHandle) return false;
        const virtualTarget: any = this.virtualNodes.get(targetNodeId);
        const audioNode: any = virtualTarget?.audioNode;
        if (!audioNode) return false;

        // Memoize per virtual-node-instance + handle.
        let handleMap = this.audioParamHandleCache.get(audioNode);
        if (handleMap) {
            const cached = handleMap.get(targetNodeHandle);
            if (cached !== undefined) return cached;
        } else {
            handleMap = new Map();
            this.audioParamHandleCache.set(audioNode, handleMap);
        }

        let result = false;
        if (targetNodeHandle in audioNode) {
            result = true;
        } else {
            const params: any = audioNode.parameters;
            if (params && typeof params.has === 'function') {
                result = params.has(targetNodeHandle);
            }
        }
        handleMap.set(targetNodeHandle, result);
        return result;
    }

    // ─── Event handler wrappers (kept as class methods for .bind(this) callers) ─

    emitEventsForConnectedEdges(node: CustomNode, data: any, eventType: string = "receiveNodeOn") {
        return _emitEventsForConnectedEdges(this, node, data, eventType);
    }

    handleSendNodeEventSwitch(node: CustomNode, data: any, eventType: string) {
        return _handleSendNodeEventSwitch(this, node, data, eventType);
    }

    handleSendNodeEventByHandle(node: CustomNode, data: any, eventType: string, sourceHandle: string) {
        return _handleSendNodeEventByHandle(this, node, data, eventType, sourceHandle);
    }

    handleReceiveNodeOnCustom(node: CustomNode, inputIndex: number, data: any) {
        return _handleReceiveNodeOnCustom(this, node, inputIndex, data);
    }

    handleReceiveNodeOffCustom(node: CustomNode, inputIndex: number, data: any) {
        return _handleReceiveNodeOffCustom(this, node, inputIndex, data);
    }

    handleReceiveOutput(node: CustomNode, data: any, eventType: string) {
        return _handleReceiveOutput(this, node, data, eventType);
    }

    handleReceiveNodeOn(node: Node, data: any) { /* handled by virtual nodes */ }

    handleReceiveNodeOff(node: Node, data: any) { /* handled by virtual nodes */ }

    handleEdgeADSR(edge: Edge, node: CustomNode) {
        return _handleEdgeADSR(this, edge, node);
    }

    handleConnectedEdgesADSRNodeOn(node: CustomNode, data: any, eventType: string) {
        return _handleConnectedEdgesADSRNodeOn(this, node, data, eventType);
    }

    handleConnectedEdgesAutomationNodeOn(node: CustomNode, data: any, eventType: string = 'receiveNodeOn') {
        return _handleConnectedEdgesAutomationNodeOn(this, node, data, eventType);
    }

    handleConnectedEdgesAutomationNodeOff(node: CustomNode, data: any, eventType: string = 'receiveNodeOff') {
        return _handleConnectedEdgesAutomationNodeOff(this, node, data, eventType);
    }

    handleConnectedEdgesADSRNodeOff(node: CustomNode, data: any, eventType: string) {
        return _handleConnectedEdgesADSRNodeOff(this, node, data, eventType);
    }

    handleConnectedEdges(node: CustomNode, data: any, eventType: string, index: number | null | string = null) {
        return _handleConnectedEdges(this, node, data, eventType, index);
    }

    handleConnectedEdgesFromOutput(node: CustomNode, outputIndex: number, data: any, eventType: string) {
        return _handleConnectedEdgesFromOutput(this, node, outputIndex, data, eventType);
    }

    collectUnisonNodes(nodeId: string, collected: CustomNode[] = []): CustomNode[] {
        return _collectUnisonNodes(this, nodeId, collected);
    }

    handleButtonUpdateParam(node: CustomNode, data: any, key: string) {
        return _handleButtonUpdateParam(this, node, data, key);
    }

    sortEdges(connectedEdges: Edge[]) {
        // Reset-targeted edges must fire first. Most edge groups have no reset
        // handle, so skip the sort entirely in that case; otherwise partition
        // into reset/non-reset and concat — avoids the O(n log n) sort and the
        // unstable comparator on large fan-outs without mutating the input.
        let hasReset = false;
        for (let i = 0; i < connectedEdges.length; i++) {
            const h = connectedEdges[i].targetHandle;
            if (h && h.toLowerCase().indexOf('reset') !== -1) {
                hasReset = true;
                break;
            }
        }
        if (!hasReset) return connectedEdges;

        const resetEdges: Edge[] = [];
        const otherEdges: Edge[] = [];
        for (let i = 0; i < connectedEdges.length; i++) {
            const e = connectedEdges[i];
            const h = e.targetHandle;
            if (h && h.toLowerCase().indexOf('reset') !== -1) resetEdges.push(e);
            else otherEdges.push(e);
        }
        return resetEdges.concat(otherEdges);
    }

    // ─── Node management ──────────────────────────────────────────────────────

    public async addVirtualNode(node: CustomNode, parentNode: CustomNode | null) {
        return _addVirtualNode(this, node, parentNode);
    }

    async createVirtualNodes(nodes: Node[], parentNode: CustomNode | null) {
        for (const node of nodes) {
            await this.addVirtualNode(node as CustomNode, parentNode ?? null);
        }
    }

    public async updateEdges() {
        this.virtualNodes.forEach((node) => {
            if (node instanceof AudioNode) {
                node.disconnect();
                this.disconnectFromMaps(node.id);
            }
        });

        this.virtualEdges = new Map<string, Edge[]>();
        this.virtualEdgeIds.clear();

        for (let i = 0; i < this.nodesRef.current.length; i++) {
            const node = this.nodesRef.current[i] as CustomNode;
            const nodeId = node.id;
            if (node.type === "FlowNode") {
                const customNodeId = (node as any).data.selectedNode as string;
                const folderPath = (node as any).data.selectedNodeFolderPath || '';
                if (customNodeId) {
                    const flowData = await this.loadFlowByName(customNodeId, folderPath);
                    if (flowData && flowData.edges) {
                        const edgesWithNewId = flowData.edges.map((edge: Edge) => ({
                            ...edge,
                            source: `${nodeId}.${edge.source}`,
                            target: `${nodeId}.${edge.target}`,
                        }));
                        this.virtualEdges.set(nodeId, this.sortEdges(edgesWithNewId));
                    }
                }
            }
        }

        this.edgesRef.current.forEach((edge: Edge) => {
            this.virtualEdges.set(edge.source, []);
        });

        this.edgesRef.current.forEach((edge: Edge) => {
            this.addConnection(edge);
        });
    }

    public resetConnectionsOfNode(nodeId: string) {
        const edges = this.getEdgesOfNode(nodeId);
        edges.forEach((edge) => { this.addConnection(edge); });
    }

    public getEdgesOfNode(nodeId: string): Edge[] {
        return this.edgesRef.current.filter((edge) => edge.source === nodeId || edge.target === nodeId);
    }

    public deleteVirtualNode(nodeId: string) {
        const audioNode = this.virtualNodes.get(nodeId);
        this.eventBus.unsubscribeAllByNodeId(nodeId);
        if (audioNode) {
            if (audioNode.dispose) audioNode.dispose();
            (audioNode as any).disconnect?.();
            this.disconnectFromMaps(nodeId);
            this.virtualNodes.delete(nodeId);
            this.nodeTypeCache.delete(nodeId);
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
            (sourceNode as any).disconnect?.(targetNode);
            const mapKey = edge.targetHandle ? `${edge.target}:${edge.targetHandle}` : edge.target;
            this.sourceNodeMapConnectionTree.get(edge.source)?.delete(mapKey);
            const targetSet = this.targetNodeMapConnectionTree.get(mapKey);
            targetSet?.delete(edge.source);
            if (targetSet && targetSet.size === 0) {
                this.targetNodeMapConnectionTree.delete(mapKey);
            }
        } else {
            console.warn(`Edge ${edge.source} to ${edge.target} not found.`);
        }
    }

    // ─── Connection management ────────────────────────────────────────────────

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
        let originalEdge = edge;
        let sourceId = edge.source;
        let targetId = edge.target;
        let sourceHandle = edge.sourceHandle as string | undefined;
        let targetHandle = edge.targetHandle as string | undefined;

        const FLOWNODE_SEG = /^FlowNode(-\d+)?$/;
        const isCustom = (id: string | undefined) =>
            !!id && id.split(".").some((s) => FLOWNODE_SEG.test(s));
        const getNodeType = (id: string | undefined) => {
            if (!id) return undefined;
            const last = id.split(".").slice(-1)[0];
            return FLOWNODE_SEG.test(last) ? "FlowNode" : last;
        };

        const getInternalGraph = (customNodeId: string): { nodes: any[]; edges: Edge[] } | null => {
            const virtualCustom = this.virtualNodes.get(customNodeId);
            if (!virtualCustom) return null;
            const baseNode =
                this.nodesRef.current.find((n: any) => n.id === customNodeId) ||
                this.nodesRef.current.find((n: any) => n.id === customNodeId.replace(/-\d+$/, ""));
            const selectedId = baseNode?.data?.selectedNode;
            if (!selectedId) return null;
            const internalNodes: any[] = [];
            this.virtualNodes.forEach((vNode: any, vid: string) => {
                if (vid.startsWith(customNodeId + ".") && vid !== customNodeId) {
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

        try {
            if (isCustom(sourceId) && sourceHandle && sourceHandle.startsWith("output-")) {
                const outputIndex = parseInt(sourceHandle.replace("output-", ""), 10);
                const parts = sourceId.split(".");
                const customIdx = parts.findIndex((s) => FLOWNODE_SEG.test(s));
                const customRootId = customIdx >= 0 ? parts.slice(0, customIdx + 1).join(".") : sourceId;
                const graph = getInternalGraph(customRootId);
                if (graph) {
                    const internalOutput = graph.nodes.find(n => n.type === 'OutputNode' && n.data?.index === outputIndex);
                    if (internalOutput) {
                        const inEdge = graph.edges.find(e => e.target === internalOutput.id && (e.targetHandle === 'input' || e.targetHandle === 'main-input'));
                        if (inEdge) {
                            sourceId = inEdge.source;
                            sourceHandle = inEdge.sourceHandle as string | undefined;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('FlowNode source remap failed', err, originalEdge);
        }

        try {
            if (isCustom(targetId) && targetHandle && targetHandle.startsWith("input-")) {
                const inputIndex = parseInt(targetHandle.replace("input-", ""), 10);
                const parts = targetId.split(".");
                const customIdx = parts.findIndex((s) => FLOWNODE_SEG.test(s));
                const customRootId = customIdx >= 0 ? parts.slice(0, customIdx + 1).join(".") : targetId;
                const graph = getInternalGraph(customRootId);
                if (graph) {
                    const internalInput = graph.nodes.find(n => n.type === 'InputNode' && n.data?.index === inputIndex);
                    if (internalInput) {
                        const outEdges = graph.edges.filter(e => e.source === internalInput.id);
                        if (outEdges.length > 0) {
                            for (const outEdge of outEdges) {
                                this.connectSourceToTarget(sourceId, outEdge.target, sourceHandle, outEdge.targetHandle, edge, originalEdge);
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
            if (handle.startsWith('param-flow-')) return { mode: 'flow', paramId: handle.slice('param-flow-'.length) };
            if (handle.startsWith('param-stream-')) return { mode: 'stream', paramId: handle.slice('param-stream-'.length) };
            return { mode: 'stream', paramId: handle.slice('param-'.length) };
        };

        const sourceNode: AudioNode | undefined = resolveOutputNode(sourceVirtual);
        const targetNodeForParams: AudioNode | AudioContext | undefined = (() => {
            if (!targetVirtual) return undefined;
            if (typeof targetVirtual.getParamNode === 'function') return targetVirtual.getParamNode();
            if (typeof targetVirtual.getOutputNode === 'function') return targetVirtual.getOutputNode();
            if (targetVirtual instanceof AudioNode || targetVirtual instanceof AudioContext) return targetVirtual;
            return targetVirtual.audioNode as AudioNode | undefined;
        })();
        let targetInputNode: AudioNode | undefined = resolveInputNode(targetVirtual, targetNodeForParams instanceof AudioNode ? targetNodeForParams : undefined);

        const targetNode: any = targetNodeForParams;

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
            if (targetVirtual && typeof targetVirtual.connectHandleNames === 'object' && Array.isArray(targetVirtual.connectHandleNames) && targetVirtual.connectHandleNames.includes(targetParamHandle)) {
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
                            (targetVirtual as VirtualOscilloscopeNode).ensureLoop();
                            targetInputNode = (targetVirtual as VirtualOscilloscopeNode).audioNode as AudioNode;
                        }
                    } catch (e) { /* noop */ }
                    const inputNode = targetInputNode ?? (targetNodeForParams as AudioNode);
                    if (!inputNode) throw new Error('Target input node unavailable');
                    sourceNode.connect(inputNode);
                    this.addMapConnections(sourceId, targetId);
                } catch (e) {
                    console.warn('[connect] failed node->node', { sourceId, targetId, e });
                }
            } else if (targetParamHandle === "destination-input") {
                if (targetNodeForParams instanceof AudioContext && sourceNode instanceof AudioNode) {
                    try {
                        sourceNode.connect(this.outputNode);
                        this.addMapConnections(sourceId, targetId);
                    } catch (e) {
                        console.warn('[connect] failed node->context.destination', { sourceId, e });
                    }
                }
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
                            const existing = this.sourceNodeMapConnectionTree.get(sourceId);
                            const mapKey = targetId + ':' + targetParamHandle;
                            if (!existing || !existing.has(mapKey)) {
                                (sourceNode as any).connect(maybeParam);
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

        const normalizedEdge = { ...edge, id: "xy-edge__" + sourceId + sourceHandle + "-" + targetId + targetHandle, source: sourceId, target: targetId, sourceHandle, targetHandle };

        const wasRemapped = originalEdge.source !== sourceId || originalEdge.target !== targetId;
        if (wasRemapped) {
            const originalSourceEdges = this.virtualEdges.get(originalEdge.source);
            if (originalSourceEdges) {
                const removedIds: string[] = [];
                const filteredEdges = originalSourceEdges.filter((e) => {
                    const drop = e.source === originalEdge.source && e.target === originalEdge.target && e.sourceHandle === originalEdge.sourceHandle && e.targetHandle === originalEdge.targetHandle;
                    if (drop) removedIds.push(e.id);
                    return !drop;
                });
                if (filteredEdges.length > 0) {
                    this.virtualEdges.set(originalEdge.source, filteredEdges);
                    const idSet = this.virtualEdgeIds.get(originalEdge.source);
                    if (idSet) for (const rid of removedIds) idSet.delete(rid);
                } else {
                    this.virtualEdges.delete(originalEdge.source);
                    this.virtualEdgeIds.delete(originalEdge.source);
                }
            }
        }

        const existingEdges = this.virtualEdges.get(sourceId);
        if (!existingEdges) {
            this.virtualEdges.set(sourceId, [normalizedEdge]);
            let idSet = this.virtualEdgeIds.get(sourceId);
            if (!idSet) {
                idSet = new Set<string>();
                this.virtualEdgeIds.set(sourceId, idSet);
            }
            idSet.add(normalizedEdge.id);
        } else {
            let idSet = this.virtualEdgeIds.get(sourceId);
            if (!idSet) {
                // Backfill if the set wasn't populated for an existing array.
                idSet = new Set<string>();
                for (let i = 0; i < existingEdges.length; i++) idSet.add(existingEdges[i].id);
                this.virtualEdgeIds.set(sourceId, idSet);
            }
            if (!idSet.has(normalizedEdge.id)) {
                existingEdges.push(normalizedEdge);
                idSet.add(normalizedEdge.id);
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
            if (targets.size === 0) sourceKeysToPrune.push(src);
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

    connectVirtualNodes(edges: Edge[]) {
        edges.forEach((edge) => { this.addConnection(edge); });
    }
}
