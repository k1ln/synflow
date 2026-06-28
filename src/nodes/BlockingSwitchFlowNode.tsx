import React, { useState, useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import EventBus from "../sys/EventBus";

export type BlockingSwitchFlowNodeProps = {
    data: {
        id: string;
        numOutputs: number;
        onChange: (data: any) => void;
    };
};

const BlockingSwitchFlowNode: React.FC<BlockingSwitchFlowNodeProps> = ({ data }) => {
    const [numOutputs, setNumOutputs] = useState(data.numOutputs || 2);
    const [numOutputsInput, setNumOutputsInput] = useState(String(data.numOutputs || 2));
    const [occupiedOutputs, setOccupiedOutputs] = useState<number[]>([]);
    const updateNodeInternals = useUpdateNodeInternals();
    const eventBus = useMemo(() => EventBus.getInstance(), []);

    useEffect(() => {
        if (data.onChange) {
            data.onChange({ ...data, numOutputs });
        }
        const timeout = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 10);
        return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numOutputs, data.id, updateNodeInternals]);

    // Subscribe to virtual node status updates to show occupied outputs
    useEffect(() => {
        const handleStatusUpdate = (status: any) => {
            if (status.occupiedOutputs) {
                setOccupiedOutputs(status.occupiedOutputs);
            }
        };
        
        eventBus.subscribe(`${data.id}.status.update`, handleStatusUpdate);
        return () => {
            eventBus.unsubscribe(`${data.id}.status.update`, handleStatusUpdate);
        };
    }, [data.id, eventBus]);

    useEffect(() => {
        setNumOutputsInput(String(numOutputs));
    }, [numOutputs]);

    const clampOutputs = (value: number) => Math.max(1, Math.min(100, value));
    const nodeHeight = useMemo(() => Math.max(110, numOutputs * 22), [numOutputs]);
    const handleStyle = useMemo(
        () => ({
            width: "10px",
            height: "10px",
            background: "#fff",
        }),
        []
    );
    const outputHandlePositions = useMemo(() => {
        return Array.from({ length: numOutputs }).map((_, index) => {
            const top = (index + 1) * (nodeHeight / (numOutputs + 1));
            return { top };
        });
    }, [numOutputs, nodeHeight]);

    return (
        <div className="flow-node-shell" style={{ width: 120, height: nodeHeight, position: "relative", padding: 4, ...((data as any).style || {}) }}>
            <div className="node-title">BLOCKING SWITCH</div>
            <div className="node-sub">locks occupied lanes</div>

            {/* Main Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="input"
                style={{
                    ...handleStyle,
                    top: "30%",
                    background: "#5e5"
                }}
            />
            <span style={{ position: "absolute", left: "-4px", top: "37%", fontSize: "9px", color: "#5e5" }}>IN</span>

            {/* Reset Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="reset-input"
                style={{
                    ...handleStyle,
                    top: "70%",
                    background: "#e55"
                }}
            />
            <span style={{ position: "absolute", left: "-8px", top: "75%", fontSize: "9px", color: "#e55" }}>RST</span>

            {/* Number of Outputs Control */}
            <div className="node-field" style={{ gap: 3, marginTop: 4 }}>
                <span className="node-label">No. steps</span>
                <div className="node-row" style={{ gap: 4 }}>
                    <button
                        type="button"
                        onClick={() => setNumOutputs((n) => clampOutputs(n - 1))}
                        className="node-btn"
                        style={{ width: 18, height: 18, padding: 0 }}
                        aria-label="Decrease outputs"
                    >−</button>
                    <input
                        type="text"
                        value={numOutputsInput}
                        onChange={(e) => {
                            const text = e.target.value.trim();
                            setNumOutputsInput(e.target.value);
                            if (text === "") {
                                return;
                            }
                            const val = parseInt(text, 10);
                            if (!Number.isNaN(val)) {
                                setNumOutputs(clampOutputs(val));
                            }
                        }}
                        onKeyDown={(e) => {
                            const current = parseInt(numOutputs.toString(), 10);
                            if (!Number.isFinite(current)) return;
                            let delta = 0;
                            if (e.ctrlKey) {
                                if (e.key === "ArrowUp") delta = 10;
                                if (e.key === "ArrowDown") delta = -10;
                            } else {
                                if (e.key === "ArrowUp") delta = 1;
                                if (e.key === "ArrowDown") delta = -1;
                            }
                            if (delta !== 0) {
                                e.preventDefault();
                                const updated = clampOutputs(current + delta);
                                setNumOutputs(updated);
                                setNumOutputsInput(String(updated));
                            }
                        }}
                        className="nodrag node-input sm"
                    />
                    <button
                        type="button"
                        onClick={() => setNumOutputs((n) => clampOutputs(n + 1))}
                        className="node-btn"
                        style={{ width: 18, height: 18, padding: 0 }}
                        aria-label="Increase outputs"
                    >+</button>
                </div>
            </div>

            {/* Output Handles */}
            {outputHandlePositions.map((style, index) => {
                const isOccupied = occupiedOutputs.includes(index);
                return (
                    <React.Fragment key={`output-${index}`}>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={`output-${index}`}
                            style={{
                                ...handleStyle,
                                top: `${style.top+10}px`,
                                background: isOccupied ? "#fa0" : "#888"
                            }}
                        />
                        <span
                            style={{
                                position: "absolute",
                                right: "9px",
                                top: `${style.top+5}px`,
                                fontSize: "9px",
                                color: isOccupied ? "#fa0" : "#777"
                            }}
                        >
                            {index}
                        </span>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default React.memo(BlockingSwitchFlowNode);
