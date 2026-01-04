import { Edge } from "@xyflow/react";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";

export class VirtualNode<U extends { id: string; data?: any }, T extends AudioNode | undefined = AudioNode> {
    protected eventBus: EventBus;
    public audioNode?: T;
    public edges: Edge[] = [];
    public node: U;
    protected audioContext?: AudioContext;
    private _lastParamSetTime: Record<string, number> = {};
    private _lastParamValue: Record<string, number> = {};

    constructor(ctx: AudioContext | undefined, audioNode: T, eventBus: EventBus, node: U, edges: Edge[] = []) {
        this.audioContext = ctx;
        this.audioNode = audioNode;
        this.eventBus = eventBus;
        this.node = node;
        this.edges = edges;
        this.subscribeParams();
    }

    subscribeParams() {
        this.eventBus.subscribe(`${this.node.id}.params.updateParams`, (data) =>
            this.handleUpdateParams(this.node, data)
        );
    }

    handleUpdateParams(node: U, data: any) {
        if (node.data && typeof node.data === "object" && data) {
            const audioNode = this.audioNode;
            
            // Track which keys were actually updated for the UI notification
            const updatedKeys: Record<string, any> = {};
            
            if (audioNode) {
                Object.keys(data.data).forEach((key) => {
                    //TODO i think i dont want this. 
                    if (key in this.node.data) {
                        this.node.data[key] = data.data[key];
                        updatedKeys[key] = data.data[key];
                    }
                    let target: any = undefined;
                    
                    if (key in audioNode) {
                        target = (audioNode as any)[key];
                    } else if (
                        audioNode.parameters &&
                        audioNode.parameters.has(key) 
                    ) {
                        target = audioNode.parameters.get(key);
                    }
                    if (target !== undefined) {
                        let incoming = data.data[key];
                        let potentialNumber = incoming*1;
                        if(typeof potentialNumber == "number" && !isNaN(potentialNumber)){ incoming = data.data[key]*1; }
                        if (target instanceof AudioParam) {
                            if (typeof incoming === 'number' && Number.isFinite(incoming)) {
                                let v = incoming*1;
                                if (key === 'frequency') {
                                    v = Math.max(0.0001, Math.min(24000, v));
                                    // Round to two decimals for stability/log readability
                                    v = Math.round(v * 100) / 100;
                                }
                                if (key === 'Q') v = Math.max(0.0001, Math.min(1000, v));

                                // Throttle & smooth for high-rate automation (esp. frequency)
                                const now = this.audioContext ? this.audioContext.currentTime : performance.now() / 1000;
                                const lastTime = this._lastParamSetTime[key] ?? -Infinity;
                                const lastVal = this._lastParamValue[key];
                                const MIN_INTERVAL = key === 'frequency' ? 0.002 : 0; // 2ms audio-time throttle
                                const RAMP_TIME = key === 'frequency' ? 0.01 : 0; // 10ms ramp for frequency to reduce zips
                                const DIFF_THRESHOLD = key === 'frequency' ? 0.0005 : 0; // relative diff threshold
                                let doSet = true;
                                if (lastVal !== undefined && key === 'frequency') {
                                    const relDiff = Math.abs(v - lastVal) / (lastVal + 1e-9);
                                    if (relDiff < DIFF_THRESHOLD) doSet = false; // ignore tiny change
                                }
                                if (now - lastTime < MIN_INTERVAL) doSet = false;
                                if (doSet) {
                                    try {
                                        if (RAMP_TIME > 0 && this.audioContext && key === 'frequency') {
                                            target.cancelScheduledValues(this.audioContext.currentTime);
                                            const current = target.value;
                                            // If jump is huge (> 4x), pre-step partway to avoid big click then ramp the rest
                                            if (current > 0 && (v / current > 4 || current / v > 4)) {
                                                const mid = current + (v - current) * 0.5;
                                                target.setValueAtTime(current, this.audioContext.currentTime);
                                                target.linearRampToValueAtTime(mid, this.audioContext.currentTime + RAMP_TIME * 0.4);
                                                target.linearRampToValueAtTime(v, this.audioContext.currentTime + RAMP_TIME);
                                            } else {
                                                target.setValueAtTime(target.value, this.audioContext.currentTime);
                                                target.linearRampToValueAtTime(v, this.audioContext.currentTime + RAMP_TIME);
                                            }
                                        } else {
                                            target.value = v;
                                        }
                                        this._lastParamSetTime[key] = now;
                                        this._lastParamValue[key] = v;
                                    } catch (e) {
                                        console.warn('[VirtualNode] automation set failed', key, v, e);
                                    }
                                }
                            } else if (typeof incoming == "string") {
                                if(audioNode instanceof AudioWorkletNode){ 
                                    audioNode.port.postMessage({ type: "set" + key, value: incoming });
                                }else {
                                    try {
                                        target.value = incoming;
                                    } catch (e) {
                                        console.warn('[VirtualNode] AudioParam string set failed', key, incoming, e);
                                    }
                                }
                            }
                        } else {
                            // Non-AudioParam assignment only if primitive or plain object (skip functions)
                            if (incoming !== undefined) {
                                (audioNode as any)[key] = incoming;
                            }
                        }
                    }
                });
            }
            else {
                Object.keys(data.data).forEach((key) => {
                    if (key in this.node.data) {
                        this.node.data[key] = data.data[key];
                        updatedKeys[key] = data.data[key];
                    }
                });
            }
            //TODO this is crab i suppose to notify only if something changed
            // // Broadcast to Flow.tsx so UI can update
            // if (Object.keys(updatedKeys).length > 0) {
            //     console.log("VirtualNode Broadcasting params.updateParams for node:", this.node, updatedKeys);
            //     const { data: _originalData, nodeid: _incomingNodeId, ...rest } = data || {};
            //     const extraPayload: Record<string, any> = {};
            //     Object.keys(rest || {}).forEach((key) => {
            //         const value = (rest as any)[key];
            //         if (value !== undefined) {
            //             extraPayload[key] = value;
            //         }
            //     });
            //     this.eventBus.emit("params.updateParams", {
            //         nodeid: this.node.id,
            //         data: updatedKeys,
            //         ...extraPayload,
            //     });
            // }
        }
    }

    connect(destination: AudioNode | AudioParam) {
        if (!this.audioNode) {
            throw new Error("Audio node is not initialized");
        }
        if (destination instanceof AudioNode) {
            this.audioNode.connect(destination);
        } else if (destination instanceof AudioParam) {
            this.audioNode.connect(destination);
        } else {
            throw new Error("Destination must be an AudioNode or AudioParam");
        }
    }

    /** Returns the AudioNode that should be used when this virtual node acts as a signal source. */
    public getOutputNode(): AudioNode | undefined {
        return this.audioNode as AudioNode | undefined;
    }

    /** Returns the AudioNode that should be used when other nodes connect into this virtual node. */
    public getInputNode(): AudioNode | undefined {
        return this.audioNode as AudioNode | undefined;
    }

    setEdges(edges: Edge[]) {
        this.edges = edges;
    }

    disconnect() {
        if (!this.audioNode) {
            return;
        }
        this.audioNode.disconnect();
    }

}

export default VirtualNode;