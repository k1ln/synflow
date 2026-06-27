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
    const divStyle = useMemo(
        () => ({
            padding: "4px",
            border: "1px solid #555",
            borderRadius: "6px",
            width: "120px",
            height: `${nodeHeight}px`,
            textAlign: "center",
            background: "#1f1f1f",
            color: "#eee",
            position: "relative",
            fontFamily: "Arial, sans-serif",
        }),
        [nodeHeight]
    );
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
        <div style={divStyle}>
            <div style={{ textAlign: "center", marginBottom: "2px", fontSize: "12px" }}>
                <span><b>Blocking Switch</b></span>
            </div>
            <div style={{ fontSize: "9px", opacity: 0.7 }}>locks occupied lanes</div>

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
            <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                marginTop: "4px"
            }}>
                <span style={{ fontSize: "11px" }}>No. steps</span>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button
                        type="button"
                        onClick={() => setNumOutputs((n) => clampOutputs(n - 1))}
                        style={{
                            width: "18px",
                            height: "18px",
                            background: "#272727",
                            color: "#fff",
                            border: "1px solid #444",
                            borderRadius: "3px",
                            fontSize: "12px",
                            cursor: "pointer"
                        }}
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
                        style={{
                            width: 40,
                            background: "#222",
                            color: "#eee",
                            border: "1px solid #444",
                            borderRadius: 4,
                            padding: "1px 3px",
                            fontSize: 10,
                            textAlign: "center"
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setNumOutputs((n) => clampOutputs(n + 1))}
                        style={{
                            width: "18px",
                            height: "18px",
                            background: "#272727",
                            color: "#fff",
                            border: "1px solid #444",
                            borderRadius: "3px",
                            fontSize: "12px",
                            cursor: "pointer"
                        }}
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
