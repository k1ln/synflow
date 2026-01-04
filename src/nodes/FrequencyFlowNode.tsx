import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Handle,
  Position,
} from "@xyflow/react";
import MidiKnob from "../components/MidiKnob";

type FrequencyType = "midi" | "hz" | "lfo";

export type FrequencyFlowNodeProps = {
  data: {
    value: number;
    frequency: number;
    frequencyType: FrequencyType;
    knobValue: number;
    id: string;
    onChange: (data: any) => void;
  };
};

const FrequencyFlowNode:
React.FC<FrequencyFlowNodeProps> = ({
  data,
}) => {
  const baseFreq = useMemo(
    () => data.frequency ?? data.value ?? 440,
    [data.frequency, data.value]
  );
  const [frequency, setFrequency] = useState(
    baseFreq
  );
  const [knobValue, setKnobValue] = useState(
    data.knobValue || 0
  );
  const [frequencyType, setFrequencyType] =
    useState<FrequencyType>(
      data.frequencyType || "hz"
    );
  const [knobMin, setKnobMin] = useState(0);
  const [knobMax, setKnobMax] = useState(100);
  const [midiNote, setMidiNote] = useState<string>(
    ""
  );
  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];

  const midiNoteToName = (note: number) => {
    const octave = Math.floor(note / 12) - 1;
    const base = noteNames[note % 12];
    return `${base}${octave}`;
  };

  const knobToFrequency = (val: number) => {
    if (frequencyType === "midi") {
      const note = Math.round(val);
      setMidiNote(midiNoteToName(note));
      const freq =
        440 * Math.pow(2, (note - 69) / 12);
      return Math.round(freq * 1000) / 1000;
    }
    if (frequencyType === "lfo") {
      const minF = 0.01;
      const maxF = 250;
      const t = val / 250;
      const p = Math.pow(t, 0.5);
      const span = maxF / minF;
      const freq = minF * Math.pow(span, p);
      return Math.round(freq * 1000) / 1000;
    }
    const minF = 20;
    const maxF = 20000;
    const span = maxF / minF;
    const freq = minF * Math.pow(span, val / 100);
    return Math.round(freq * 1000) / 1000;
  };

  const frequencyToKnob = (freq: number) => {
    if (frequencyType === "midi") {
      const note =
        69 + 12 * Math.log2(freq / 440);
      return Math.min(
        Math.max(note, 0),
        127
      );
    }
    if (frequencyType === "lfo") {
      const minF = 0.01;
      const maxF = 250;
      const top = Math.log(freq / minF);
      const bot = Math.log(maxF / minF);
      const t = top / bot;
      const p = Math.pow(t, 2);
      return Math.min(Math.max(p * 250, 0), 250);
    }
    const minF = 20;
    const maxF = 20000;
    const top = Math.log(freq / minF);
    const bot = Math.log(maxF / minF);
    const t = top / bot;
    return Math.min(
      Math.max(t * 100, 0),
      100
    );
  };

  const handleKnobChange = (val: number) => {
    setKnobValue(val);
    setFrequency(knobToFrequency(val));
  };

  const handleTypeChange = (next: FrequencyType) => {
    setFrequencyType(next);
    if (next === "midi") {
      setKnobMin(24);
      setKnobMax(96);
    } else if (next === "hz") {
      setKnobMin(0);
      setKnobMax(100);
    } else {
      setKnobMin(0);
      setKnobMax(250);
    }
  };

  useEffect(() => {
    handleTypeChange(frequencyType);
    setKnobValue(frequencyToKnob(frequency));
  }, []);

  useEffect(() => {
    data.onChange?.({
      ...data,
      frequency,
      value: frequency,
      frequencyType,
      knobValue,
    });
  }, [
    frequency,
    frequencyType,
    knobValue,
  ]);

  return (
    <div
      style={{
        padding: 4,
        border: "1px solid #555",
        borderRadius: 6,
        background: "#333",
        color: "#eee",
         width: 72,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 18, width: 8, height: 8 }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
        }}
      >
          <div
            style={{
              width: 44,
              height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MidiKnob
            min={knobMin}
            max={knobMax}
            value={knobValue}
            onChange={handleKnobChange}
          />
        </div>
        <div style={{ fontSize: 10, color: "#aaa" }}>
          {frequency.toFixed(3)} Hz
        </div>
        {frequencyType === "midi" && (
          <div style={{ fontSize: 9, color: "#888" }}>
            {midiNote}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            width: "100%",
          }}
        >
            <select
              value={frequencyType}
              onChange={(e) =>
                handleTypeChange(
                  e.target.value as FrequencyType
                )
              }
              style={{
                width: 50,
                background: '#222',
                color: '#eee',
                border: '1px solid #444',
                borderRadius: 4,
                padding: '1px 3px',
                fontSize: 10,
                textAlign: 'center',
              }}
            >
              <option value="midi">midi</option>
              <option value="hz">hz</option>
              <option value="lfo">lfo</option>
            </select>
            <input
              type="text"
              value={frequency}
              onChange={(e) => {
                const v =
                  parseFloat(e.target.value);
                if (!Number.isFinite(v)) {
                  return;
                }
                setFrequency(v);
                setKnobValue(
                  frequencyToKnob(v)
                );
                if (frequencyType === "midi") {
                  setMidiNote(
                    midiNoteToName(
                      Math.round(v)
                    )
                  );
                }
              }}
              style={{
                width: 50,
                background: '#222',
                color: '#eee',
                border: '1px solid #444',
                borderRadius: 4,
                padding: '1px 3px',
                fontSize: 10,
                textAlign: 'center',
              }}
            />
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: 18, width: 8, height: 8 }}
      />
    </div>
  );
};

export default FrequencyFlowNode;