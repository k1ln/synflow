import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import EventBus from "../sys/EventBus";

export type FunctionNodeProps = {
  data: {
    functionCode: string;
    value: string;
    id: string;
    numInputs?: number;
    numOutputs?: number;
    inputDefaults?: string[];
    onChange: (data: any) => void;
  };
};

const FunctionFlowNode: React.FC<FunctionNodeProps> = ({ data }) => {
  const [functionCode, setFunctionCode] = useState(data.functionCode);
  const [numInputs, setNumInputs] = useState(data.numInputs || 1);
  const [numOutputs, setNumOutputs] = useState(data.numOutputs  || 1);
  const [inputDefaults, setInputDefaults] = useState<string[]>(
    data.inputDefaults || Array(data.numInputs || 1).fill("")
  );
  const [inputValues, setInputValues] = useState<string[]>(
    data.inputDefaults || Array(data.numInputs || 1).fill("")
  );
  const [numInputsDisplay, setNumInputsDisplay] = useState(`${numInputs}`);
  const [numOutputsDisplay, setNumOutputsDisplay] = useState(`${numOutputs}`);
  const [outputValue, setOutputValue] = useState("");
  const eventBus = EventBus.getInstance();
  const nodeStyle: React.CSSProperties = {
    padding: "5px",
    border: "1px solid #2b2b2b",
    borderRadius: "9px",
    width: "360px",
    textAlign: "left",
    background: "linear-gradient(140deg,#181818,#1f1f1f 55%,#232323)",
    color: "#eee",
    boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
    fontSize: 12,
  };
  const sectionStyle: React.CSSProperties = {
    marginTop: 2,
    padding: "2px 2px",
    border: "1px solid #2f2f2f",
    borderRadius: 6,
    background: "rgba(10,10,10,0.45)",
  };
  const inputStyle: React.CSSProperties = {
    width: 40,
    background: "#222",
    color: "#eee",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "2px 6px",
    fontSize: 11,
    textAlign: "center",
    marginLeft: 8,
  };
  const longInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: "80%",
    margin: 2,
    flex: 1,
  };
  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  };
  const headerTagStyle: React.CSSProperties = {
    fontWeight: 600,
    letterSpacing: 1,
  };
  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "linear-gradient(90deg,transparent,#3a3a3a,transparent)",
    margin: "10px 0",
  };

  // Listen for additional input signals (do not trigger output)
  useEffect(() => {
    const handlers: Array<() => void> = [];
    for (let i = 0; i < numInputs; i++) {
      const handler = (inputData: any) => {
        setInputValues((vals) => {
          const newVals = [...vals];
          const incoming =
            inputData?.value ??
            inputData?.data?.value ??
            "";
          newVals[i] = incoming;
          return newVals;
        });
      };
      eventBus.subscribe(`${data.id}.input-${i}.receiveNodeOn`, handler);
      handlers.push(() => eventBus.unsubscribe(`${data.id}.input-${i}.receiveNodeOn`, handler));
    }
    return () => {
      handlers.forEach((unsub) => unsub());
    };
  }, [numInputs, data.id, eventBus]);

  // Evaluate the function and process the input value
  const evaluateFunction = useCallback(
    (mainInput: string) => {
      let nextValue = "";
      try {
        // Compose argument list: main input + additional inputs
        const args = [mainInput, ...inputValues.map((v, i) => v || inputDefaults[i] || "")];
        //console.log(args)
        const argNames = ["main", ...inputValues.map((_, i) => `input${i + 1}`)];
        const func = new Function(
          ...argNames,
          `${functionCode};`
        );
        const result = func(...args);
        nextValue = `${result ?? ""}`;
        eventBus.emit(`${data.id}.main-input.sendNodeOn`, { value: result });
      } catch (error) {
        console.error("Error evaluating function:", error);
        nextValue = "Error";
        eventBus.emit(`${data.id}.main-input.sendNodeOn`, { value: "Error" });
      }
      setOutputValue(nextValue);
    },
    [functionCode, data.id, eventBus, inputValues, inputDefaults]
  );

  // Listen for main input
  useEffect(() => {
    const handleReceiveNodeOn = (inputData: any) => {
      const mainValue =
        inputData?.value ??
        inputData?.data?.value ??
        "";
      evaluateFunction(mainValue);
      //console.log(`Function evaluated with main input: ${mainValue}`);
    };
    eventBus.subscribe(`${data.id}.main-input.receiveNodeOn`, handleReceiveNodeOn);
    return () => {
      eventBus.unsubscribe(`${data.id}.main-input.receiveNodeOn`, handleReceiveNodeOn);
    };
  }, [data.id, evaluateFunction, eventBus]);

  // Notify parent of changes
  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({
        ...data,
        functionCode,
        value: outputValue,
        numInputs,
        numOutputs,
        inputDefaults,
      });
    }
  }, [functionCode, outputValue, numInputs, inputDefaults, numOutputs]);

  // Handle changing number of additional inputs
  const syncInputArrays = (count: number) => {
    setInputDefaults((arr) => {
      const next = [...arr];
      while (next.length < count) next.push("");
      return next.slice(0, count);
    });
    setInputValues((arr) => {
      const next = [...arr];
      while (next.length < count) next.push("");
      return next.slice(0, count);
    });
  };

  const clampCount = (value: number) => Math.max(1, Math.min(8, value));

  const updateInputsCount = (value: number) => {
    const clamped = clampCount(value);
    setNumInputs(clamped);
    setNumInputsDisplay(`${clamped}`);
    syncInputArrays(clamped);
  };

  const updateOutputsCount = (value: number) => {
    const clamped = clampCount(value);
    setNumOutputs(clamped);
    setNumOutputsDisplay(`${clamped}`);
  };

  const parseDisplayValue = (display: string, fallback: number) => {
    if (/^\d+$/.test(display.trim())) {
      return Number(display.trim());
    }
    return fallback;
  };

  const handleNumInputsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.trim() === "") {
      setNumInputsDisplay("");
      return;
    }
    if (!/^\d+$/.test(raw)) {
      return;
    }
    updateInputsCount(Number(raw));
  };

  const handleNumOutputsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.trim() === "") {
      setNumOutputsDisplay("");
      return;
    }
    if (!/^\d+$/.test(raw)) {
      return;
    }
    updateOutputsCount(Number(raw));
  };

  const handleCountKeyDown = (
    type: "inputs" | "outputs"
  ): React.KeyboardEventHandler<HTMLInputElement> => (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 1 : -1;
    if (type === "inputs") {
      const current = parseDisplayValue(numInputsDisplay, numInputs);
      updateInputsCount(current + delta);
    } else {
      const current = parseDisplayValue(numOutputsDisplay, numOutputs);
      updateOutputsCount(current + delta);
    }
  };

  // Handle changing default values
  const handleDefaultChange = (i: number, val: string) => {
    setInputDefaults((arr) => {
      const next = [...arr];
      next[i] = val;
      return next;
    });
  };

  useEffect(() => {
    setNumInputsDisplay(`${numInputs}`);
  }, [numInputs]);

  useEffect(() => {
    setNumOutputsDisplay(`${numOutputs}`);
  }, [numOutputs]);

  const resetNumInputsDisplay = () => {
    if (numInputsDisplay.trim() === "") {
      setNumInputsDisplay(`${numInputs}`);
    }
  };

  const resetNumOutputsDisplay = () => {
    if (numOutputsDisplay.trim() === "") {
      setNumOutputsDisplay(`${numOutputs}`);
    }
  };

  return (
    <div style={nodeStyle}>
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 40, width: "10px", height: "10px" }}
      />
      {Array.from({ length: numInputs }).map((_, i) => (
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          style={{ top: 70 + i * 20, width: "10px", height: "10px", background: "#0af" }}
        />
      ))}

      {/* Node Content */}
      <div style={sectionStyle}>
        <CodeMirror
          value={functionCode}
          extensions={[javascript()]}
          theme={vscodeDark}
          onChange={(value) => setFunctionCode(value)}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
        <div style={{ ...sectionStyle, flex: "1 1 150px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "right" }}>
            <span style={{ padding: 5, color: "#fff" }}>No. of Inputs</span>
            <input
              type="text"
              value={numInputsDisplay}
              onChange={handleNumInputsChange}
              style={{ ...inputStyle, marginLeft: 12, marginTop: 0, marginBottom: 2 }}
              placeholder="1-8"
              onBlur={resetNumInputsDisplay}
              onKeyDown={handleCountKeyDown("inputs")}
            />
          </div>
        </div>
        <div style={{ ...sectionStyle, flex: "1 1 150px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: 5, color: "#fff" }}>No. of Outputs</span>
            <input
              type="text"
              value={numOutputsDisplay}
              onChange={handleNumOutputsChange}
              style={{ ...inputStyle, marginLeft: 0, marginTop: 2, marginBottom: 2 }}
              placeholder="1-8"
              onBlur={resetNumOutputsDisplay}
              onKeyDown={handleCountKeyDown("outputs")}
            />
          </div>
        </div>
      </div>
      <div style={sectionStyle}>
        {Array.from({ length: numInputs }).map((_, i) => (
          <div
            key={i}
            style={{
              marginBottom: 2,
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ padding: 5, color: "#8cf", fontSize: 11, minWidth: 60 }}>
              Default input{i + 1}
            </span>
            <input
              type="text"
              value={inputDefaults[i] || ""}
              onChange={(e) => handleDefaultChange(i, e.target.value)}
              style={longInputStyle}
              placeholder="optional value"
            />
          </div>
        ))}
      </div>
      {/* Output Handle */}
      {Array.from({ length: numOutputs}).map((_, i) => (
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          style={{ top: 20 + i * 17, width: "10px", height: "10px" }}
        />
      ))}
    </div>
  );
};

export default React.memo(FunctionFlowNode);