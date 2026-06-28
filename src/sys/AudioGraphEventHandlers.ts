// @ts-nocheck
import { Edge, Node } from "@xyflow/react";
import { ADSRFlowNodeProps } from "../nodes/ADSRFlowNode";
import { ButtonNodeProps } from "../nodes/ButtonFlowNode";
import { webAudioApiFlowNodes, CustomNode } from "./AudioGraphTypes";

// All handler functions receive the AudioGraphManager instance as first argument
// so they can access virtualNodes, virtualEdges, eventBus, audioContext, etc.
// The class methods in AudioGraphManager are thin wrappers calling these.

export function emitEventsForConnectedEdges(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string = "receiveNodeOn"
) {
    let connectedEdges = manager.virtualEdges.get(node.id);

    if (!connectedEdges || connectedEdges.length === 0) {
        const fallbackEdges = manager.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
        if (fallbackEdges.length) {
            fallbackEdges.forEach((edge) => manager.addConnection(edge));
            connectedEdges = manager.virtualEdges.get(node.id) || fallbackEdges;
        }
    }

    if (!connectedEdges || connectedEdges.length === 0) {
        console.warn(`No connected edges found for node: ${node.id}`);
        return;
    }

    const { sourceHandle, ...dataToForward } = data || {};

    connectedEdges.forEach((edge) => {
        if (sourceHandle &&
            edge.sourceHandle &&
            edge.sourceHandle !== sourceHandle) {
            return;
        }

        const targetNodeId = edge.target;
        const targetNodeHandle = edge.targetHandle;

        if (targetNodeId != null) {
            const typeSplit = targetNodeId.split(".");
            if (typeSplit) {
                const type = typeSplit[typeSplit.length - 1];
                if (webAudioApiFlowNodes.includes(type)) {
                    if (!manager.isAudioParamTargetHandle(targetNodeId, targetNodeHandle)) {
                        if (eventType !== "receiveNodeOff") {
                            manager.eventBus.emit(`${targetNodeId}.params.updateParams`, {
                                nodeId: targetNodeId,
                                source: node.id,
                                data: {
                                    [targetNodeHandle]: dataToForward.value,
                                    value: dataToForward.value,
                                }
                            });
                        }
                        return;
                    }
                }
            }
        }

        const eventChannel = `${targetNodeId}.${targetNodeHandle}.${eventType}`;
        manager.eventBus.emit(eventChannel, {
            ...dataToForward,
            nodeId: targetNodeId,
            source: node.id,
        });
    });
}

export function handleSendNodeEventSwitch(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string
) {
    const connectedEdges = manager.virtualEdges.get(node.id);

    if (!connectedEdges) {
        console.warn(`No connected edges found for node: ${node.id}`);
        return;
    }
    connectedEdges.forEach((edge) => {
        const targetNodeId = edge.target;
        const targetNodeHandle = edge.targetHandle;
        const sourceHandle = edge.sourceHandle;

        if (sourceHandle) {
            const switchIndex = data.switchIndex;
            if (sourceHandle !== "output-" + switchIndex) {
                return;
            }
        }

        if (targetNodeId != null) {
            const typeSplit = targetNodeId.split(".");
            if (typeSplit) {
                const type = typeSplit[typeSplit.length - 1];
                if (webAudioApiFlowNodes.includes(type)) {
                    if (!manager.isAudioParamTargetHandle(targetNodeId, targetNodeHandle)) {
                        if (eventType !== "receiveNodeOff") {
                            manager.eventBus.emit(`${targetNodeId}.params.updateParams`, {
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
            }
        }

        manager.eventBus.emit(`${targetNodeId}.${targetNodeHandle}.${eventType}`, {
            ...data,
            nodeId: targetNodeId,
            source: node.id,
        });
    });
}

export function handleSendNodeEventByHandle(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string,
    sourceHandle: string
) {
    const connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges || connectedEdges.length === 0) {
        const fallbackEdges = manager.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
        if (fallbackEdges.length) {
            fallbackEdges.forEach((edge) => manager.addConnection(edge));
        }
    }
    const edges = manager.virtualEdges.get(node.id);
    if (!edges) return;

    edges.forEach((edge) => {
        if (edge.sourceHandle !== sourceHandle) return;

        const targetNodeId = edge.target;
        const targetNodeHandle = edge.targetHandle;
        if (!targetNodeId) return;

        const typeSplit = targetNodeId.split(".");
        const type = typeSplit[typeSplit.length - 1];
        if (webAudioApiFlowNodes.includes(type)) {
            if (manager.isAudioParamTargetHandle(targetNodeId, targetNodeHandle)) {
                if (eventType !== "receiveNodeOff") {
                    manager.eventBus.emit(`${targetNodeId}.params.updateParams`, {
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

        manager.eventBus.emit(`${targetNodeId}.${targetNodeHandle}.${eventType}`, {
            ...data,
            nodeId: targetNodeId,
            source: node.id,
        });
    });
}

export function handleReceiveNodeOnCustom(
    manager: any,
    node: CustomNode,
    inputIndex: number,
    data: any
) {
    manager.eventBus.emit(node.id + ".input-" + inputIndex + ".receiveNodeOn", {
        nodeId: node.id,
        ...data,
    });
}

export function handleReceiveNodeOffCustom(
    manager: any,
    node: CustomNode,
    inputIndex: number,
    data: any
) {
    manager.eventBus.emit(node.id + ".input-" + inputIndex + ".receiveNodeOff", {
        nodeId: node.id,
        ...data,
    });
}

export function handleReceiveOutput(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string
) {
    const parentNode = node.parentNode;
    if (parentNode) {
        manager.eventBus.emit(parentNode.id + ".output-" + node.data.index + "." + eventType, {
            nodeId: node.id,
            outputIndex: node.data.index,
            ...data,
        });
    } else {
        console.warn("Parent node not found for output node:", node);
    }
}

export function handleEdgeADSR(
    manager: any,
    edge: Edge,
    node: CustomNode
) {
    const targetNodeId = edge.target;
    const virtualTarget = manager.virtualNodes.get(targetNodeId);
    if (!virtualTarget || !(virtualTarget.audioNode instanceof AudioNode)) return;
    const paramName: string = edge.targetHandle;
    const audioParam: AudioParam | undefined = (virtualTarget.audioNode)[paramName];
    if (!(audioParam instanceof AudioParam)) return;

    const rawBase = virtualTarget?.node?.data?.[paramName];
    const fallbackBase = manager.nodesRef.current.find((n: any) => n.id === targetNodeId)?.data?.[paramName];
    const baseValue = (typeof rawBase === 'number' ? rawBase : (typeof fallbackBase === 'number' ? fallbackBase : 1));

    const attackTime = node.data?.attackTime || 0.1;
    const sustainTime = node.data?.sustainTime || 0.5;
    const sustainLevel = node.data?.sustainLevel || 0.7;
    const minPercent = (node.data?.minPercent ?? 0) / 100;
    const maxPercent = (node.data?.maxPercent ?? 100) / 100;
    const minAbs = baseValue * minPercent;
    const maxAbs = baseValue * maxPercent;
    const now = manager.audioContext.currentTime;
    audioParam.cancelScheduledValues(now);
    const startVal = audioParam.value > minAbs ? audioParam.value : minAbs;
    audioParam.setValueAtTime(startVal, now);
    audioParam.linearRampToValueAtTime(maxAbs, now + attackTime);
    const sustainAbs = minAbs + (maxAbs - minAbs) * sustainLevel;
    audioParam.linearRampToValueAtTime(sustainAbs, now + attackTime + sustainTime);
}

export function handleConnectedEdgesADSRNodeOn(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string
) {
    let connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges || connectedEdges.length === 0) {
        const fallbackEdges = manager.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
        if (fallbackEdges.length) {
            fallbackEdges.forEach(edge => manager.addConnection(edge));
            connectedEdges = manager.virtualEdges.get(node.id) || fallbackEdges;
        }
    }
    if (!connectedEdges || connectedEdges.length === 0) {
        console.warn(`No connected edges found for node: ${node.id}`);
        return;
    }
    const sortedEdges = manager.sortEdges(connectedEdges);
    for (const edge of sortedEdges) {
        handleEdgeADSR(manager, edge, node);
    }
}

export function handleConnectedEdgesAutomationNodeOn(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string = 'receiveNodeOn'
) {
    const connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges) return;
    const points: { x: number; y: number }[] = Array.isArray(node.data?.points) ? [...node.data.points].sort((a, b) => a.x - b.x) : [];
    if (points.length < 2) return;
    const lengthSec = typeof node.data?.lengthSec === 'number' ? node.data.lengthSec : 1;
    const minPercent = (typeof node.data?.min === 'number' ? node.data.min : 0);
    const maxPercent = (typeof node.data?.max === 'number' ? node.data.max : 200);
    const spanPercent = (maxPercent - minPercent) || 1;
    connectedEdges.forEach((edge: Edge) => {
        const targetNodeId = edge.target;
        const virtualTarget = manager.virtualNodes.get(targetNodeId);
        if (!virtualTarget || !(virtualTarget as any).audioNode) return;
        const audioNode: any = (virtualTarget as any).audioNode;
        const targetHandle: string = edge.targetHandle;
        const param: AudioParam | undefined = audioNode[targetHandle];
        if (!(param instanceof AudioParam)) return;
        const configuredBase = virtualTarget?.node?.data?.[targetHandle];
        const baseValue: number = (typeof configuredBase === 'number' && !isNaN(configuredBase)) ? configuredBase : 1;
        const now = manager.audioContext.currentTime;
        param.cancelScheduledValues(now);
        points.forEach((p, idx) => {
            const t = now + (p.x * lengthSec);
            const percent = maxPercent - p.y * spanPercent;
            const absValue = baseValue * (percent / 100);
            if (idx === 0) {
                param.setValueAtTime(absValue, t);
            } else {
                param.linearRampToValueAtTime(absValue, t);
            }
        });
    });
}

export function handleConnectedEdgesAutomationNodeOff(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string = 'receiveNodeOff'
) {
    const connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges) return;
    const now = manager.audioContext.currentTime;
    connectedEdges.forEach((edge: Edge) => {
        const targetNodeId = edge.target;
        const virtualTarget = manager.virtualNodes.get(targetNodeId);
        if (!virtualTarget || !(virtualTarget as any).audioNode) return;
        const audioNode: any = (virtualTarget as any).audioNode;
        const targetHandle: string = edge.targetHandle;
        const param: AudioParam | undefined = audioNode[targetHandle];
        if (!(param instanceof AudioParam)) return;
        param.cancelScheduledValues(now);
    });
}

export function handleConnectedEdgesADSRNodeOff(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string
) {
    let connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges || connectedEdges.length === 0) {
        const fallbackEdges = manager.edgesRef.current?.filter((e: Edge) => e.source === node.id) ?? [];
        if (fallbackEdges.length) {
            fallbackEdges.forEach(edge => manager.addConnection(edge));
            connectedEdges = manager.virtualEdges.get(node.id) || fallbackEdges;
        }
    }
    if (!connectedEdges || connectedEdges.length === 0) {
        console.warn(`No connected edges found for node: ${node.id}`);
        return;
    }
    connectedEdges.forEach((edge: Edge) => {
        const targetNodeId = edge.target;
        const virtualTarget = manager.virtualNodes.get(targetNodeId);
        if (!virtualTarget || !(virtualTarget.audioNode instanceof AudioNode)) return;
        const paramName: string = edge.targetHandle;
        const audioParam: AudioParam | undefined = (virtualTarget.audioNode)[paramName];
        if (!(audioParam instanceof AudioParam)) return;
        const rawBase = virtualTarget?.node?.data?.[paramName];
        const fallbackBase = manager.nodesRef.current.find((n: any) => n.id === targetNodeId)?.data?.[paramName];
        const baseValue = (typeof rawBase === 'number' ? rawBase : (typeof fallbackBase === 'number' ? fallbackBase : 1));
        const minPercent = (node.data?.minPercent ?? 0) / 100;
        const minAbs = baseValue * minPercent;
        const releaseTime = node.data?.releaseTime || 0.3;
        const now = manager.audioContext.currentTime;
        audioParam.cancelScheduledValues(now);
        audioParam.setValueAtTime(audioParam.value, now);
        audioParam.linearRampToValueAtTime(minAbs, now + releaseTime);
    });
}

export function handleConnectedEdges(
    manager: any,
    node: CustomNode,
    data: any,
    eventType: string,
    index: number | null | string = null
) {
    const connectedEdges = manager.virtualEdges.get(node.id);
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
                                manager.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
                            }
                        } else {
                            manager.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
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
                const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : { value: rawPayload };
                manager.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                    ...payload,
                    nodeId: targetNodeId,
                    source: node.id,
                });
                continue;
            }
            if (edge.sourceHandle !== index) {
                continue;
            } else {
                const rawPayload = Array.isArray(data) ? data[index] : data;
                const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : { value: rawPayload };
                manager.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                    ...payload,
                    nodeId: targetNodeId,
                    source: node.id,
                });
            }
        } else {
            manager.eventBus.emit(`${targetNodeId}.${edge.targetHandle}.${eventType}`, {
                ...data,
                nodeId: targetNodeId,
                source: node.id,
            });
        }
    }
}

export function handleConnectedEdgesFromOutput(
    manager: any,
    node: CustomNode,
    outputIndex: number,
    data: any,
    eventType: string
) {
    const connectedEdges = manager.virtualEdges.get(node.id);
    if (!connectedEdges) return;
    const sourceHandle = "output-" + outputIndex;
    connectedEdges.forEach(edge => {
        if (edge.sourceHandle !== sourceHandle) return;
        const targetNodeId = edge.target;
        if (targetNodeId != null) {
            const typeSplit = targetNodeId.split(".");
            if (typeSplit) {
                const type = typeSplit[typeSplit.length - 1];
                if (webAudioApiFlowNodes.includes(type) && type !== "SampleFlowNode") {
                    const targetNodeHandle = edge.targetHandle;
                    const targetNodeHandleData = data.value;
                    const targetDataObject = {
                        nodeId: targetNodeId,
                        source: node.id,
                        data: { [targetNodeHandle]: targetNodeHandleData }
                    };
                    if (eventType !== "receiveNodeOff") {
                        manager.eventBus.emit(`${targetNodeId}.params.updateParams`, targetDataObject);
                        return;
                    }
                }
            }
        }
        manager.eventBus.emit(
            `${targetNodeId}.${edge.targetHandle}.${eventType}`,
            { ...data, nodeId: targetNodeId, source: node.id }
        );
    });
}

export function collectUnisonNodes(
    manager: any,
    nodeId: string,
    collected: CustomNode[] = []
): CustomNode[] {
    for (let i = 0; i < manager.edgesRef.current.length; i++) {
        if (manager.edgesRef.current[i].source === nodeId) {
            const targetNode = manager.nodesRef.current.find((n: any) => n.id === manager.edgesRef.current[i].target);
            if (targetNode) {
                if (targetNode.type === "UnisonEndFlowNode") break;
                if (/FlowNode-\d+/.test(targetNode.id)) continue;
                if (collected.some((c) => c.id === targetNode.id)) continue;
                collected.push(targetNode);
                collectUnisonNodes(manager, targetNode.id, collected);
            }
        }
    }
    return collected;
}

export function handleButtonUpdateParam(
    manager: any,
    node: CustomNode,
    data: any,
    key: string
) {
    if (key === "assignedKey") {
        (node as ButtonNodeProps).data.assignedKey = data.value;
        manager.eventManager.addButtonDownCallback(data.value, node.id, (data) => {
            manager.eventBus.emit(node.id + ".main-input.sendNodeOn", { nodeid: node.id });
        });
        manager.eventManager.addButtonUpCallback(data.value, node.id, (data) => {
            manager.eventBus.emit(node.id + ".main-input.sendNodeOff", { nodeid: node.id });
        });
    }
}
