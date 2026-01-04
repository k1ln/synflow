import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Knob } from "react-rotary-knob-react19";
import EventBus from '../sys/EventBus';
import './AudioNode.css';
import MidiKnob from '../components/MidiKnob';

type FrequencyType = "midi" | "hz" | "lfo";

// Utility: Convert note name (e.g., A4, C#3, Db3) to MIDI number
function noteNameToMidi(note: string): number | null {
  const m = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!m) return null;
  const noteBase = m[1];
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  if (isNaN(octave)) return null;
  const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = baseMap[noteBase];
  if (accidental === '#') semitone += 1;
  else if (accidental === 'B') semitone -= 1; // using 'B' to represent flat from user input like Db -> D B
  // Normalize
  semitone = (semitone + 12) % 12;
  const midi = (octave + 1) * 12 + semitone; // MIDI definition: C-1 = 0
  if (midi < 0 || midi > 127) return null;
  return midi;
}

function midiToFrequency(midi: number): number {
  return +(440 * Math.pow(2, (midi - 69) / 12)).toFixed(4);
}

// Convert MIDI note to note name
function midiNoteToNoteName(midiNote: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midiNote / 12) - 1;
  const note = noteNames[midiNote % 12];
  return `${note}${octave}`;
}

// Map knob value to frequency based on type
function knobToFrequency(knobValue: number, frequencyType: FrequencyType): number {
  if (frequencyType === "midi") {
    knobValue = Math.round(knobValue);
    let frequency = 440 * Math.pow(2, (knobValue - 69) / 12);
    frequency = Math.round(frequency * 1000) / 1000;
    return frequency;
  } else if (frequencyType === "lfo") {
    const minLfoFrequency = 0.01; // Minimum LFO frequency
    const maxLfoFrequency = 250; // Maximum LFO frequency
    const scaledValue = knobValue / 250; // Scale knob value to 0–1
    const scaledValueLinear = Math.pow(scaledValue, 0.5); // Adjust the curve for a more linear climb
    const lfoFrequency = minLfoFrequency * Math.pow(maxLfoFrequency / minLfoFrequency, scaledValueLinear);
    return Math.round(lfoFrequency * 1000) / 1000;
  } else if (frequencyType === "hz") {
    const minFrequency = 20; // Minimum frequency
    const maxFrequency = 20000; // Maximum frequency
    let frequency = minFrequency * Math.pow(maxFrequency / minFrequency, knobValue / 100);
    frequency = Math.round(frequency * 1000) / 1000;
    return frequency;
  }
  return 440;
}

// Inverse: map a frequency (Hz) to a knob value for a target frequency type's scale.
function frequencyToKnobValue(frequency: number, targetType: FrequencyType): number {
  if (targetType === 'midi') {
    // MIDI note number formula
    const midi = 69 + 12 * Math.log2(frequency / 440);
    return Math.round(Math.max(0, Math.min(127, midi)));
  } else if (targetType === 'hz') {
    const minFrequency = 20;
    const maxFrequency = 20000;
    const clamped = Math.max(minFrequency, Math.min(maxFrequency, frequency));
    const ratio = Math.log(clamped / minFrequency) / Math.log(maxFrequency / minFrequency); // 0..1
    return Math.max(0, Math.min(100, ratio * 100));
  } else if (targetType === 'lfo') {
    const minLfoFrequency = 0.01;
    const maxLfoFrequency = 250;
    const clamped = Math.max(minLfoFrequency, Math.min(maxLfoFrequency, frequency));
    const ratio = Math.log(clamped / minLfoFrequency) / Math.log(maxLfoFrequency / minLfoFrequency); // scaledValueLinear (0..1)
    const knob = 250 * Math.pow(ratio, 2); // invert square root applied in forward mapping
    return Math.max(0, Math.min(250, knob));
  }
  return 0;
}

export interface SequencerFrequencyFlowNodeData {
  id?: string;
  squares?: number;
  rows?: number; // number of rows (1-25)
  patterns?: boolean[][]; // 2D: rows × steps
  pattern?: boolean[]; // legacy single row
  notes?: string[][]; // 2D: rows × steps
  frequencies?: number[][]; // 2D: rows × steps
  knobValues?: number[][]; // 2D: rows × steps
  frequencyType?: FrequencyType;
  defaultPulseMs?: number;
  onChange?: (d: any) => void;
  style?: React.CSSProperties;
  gpuEnabled?: boolean; // if false, avoid graphic updates
}

export interface SequencerFrequencyFlowNodeProps {
  id?: string;
  data: SequencerFrequencyFlowNodeData;
}

const SequencerFrequencyFlowNode: React.FC<SequencerFrequencyFlowNodeProps> = ({
  id,
  data
}) => {
  const eventBus = EventBus.getInstance();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeId = (data as any).id ?? id;

  const [total, setTotal] = useState<number>(data.squares ?? 8);
  const [rows, setRows] = useState<number>(
    Math.max(1, Math.min(25, (data as any).rows ?? 1))
  );
  const [rawTotal, setRawTotal] = useState<string>(
    () => String(data.squares ?? 8)
  );
  const [frequencyType, setFrequencyType] = useState<FrequencyType>(
    data.frequencyType || "midi"
  );
  const [knobMin, setKnobMin] = useState(24);
  const [knobMax, setKnobMax] = useState(96);
  const [selectedRow, setSelectedRow] = useState<number>(0);

  // Multi-row patterns: array of boolean arrays
  const [patterns, setPatterns] = useState<boolean[][]>(() => {
    const incoming = (data as any).patterns ?? data.pattern;
    const rowCount = Math.max(1, Math.min(25, (data as any).rows ?? 1));
    const len = data.squares ?? 8;

    if (
      Array.isArray(incoming) &&
      incoming.length > 0 &&
      Array.isArray(incoming[0])
    ) {
      const result: boolean[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const row = (incoming as boolean[][])[r];
        if (Array.isArray(row)) {
          result.push(
            row.slice(0, len).concat(
              Array(Math.max(0, len - row.length)).fill(false)
            )
          );
        } else {
          result.push(Array.from({ length: len }, () => false));
        }
      }
      return result;
    }

    if (Array.isArray(incoming)) {
      const row = (incoming as boolean[])
        .slice(0, len)
        .concat(Array(Math.max(0, len - incoming.length)).fill(false));
      const result: boolean[][] = [row];
      for (let r = 1; r < rowCount; r++) {
        result.push(Array.from({ length: len }, () => false));
      }
      return result;
    }

    return Array.from({ length: rowCount }, () =>
      Array.from({ length: len }, () => false)
    );
  });

  // Multi-row knobValues: array of number arrays
  const [knobValues, setKnobValues] = useState<number[][]>(() => {
    const incoming = (data as any).knobValues;
    const rowCount = Math.max(1, Math.min(25, (data as any).rows ?? 1));
    const len = data.squares ?? 8;

    if (
      Array.isArray(incoming) &&
      incoming.length > 0 &&
      Array.isArray(incoming[0])
    ) {
      const result: number[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const row = (incoming as number[][])[r];
        if (Array.isArray(row)) {
          result.push(
            row.slice(0, len).concat(
              Array(Math.max(0, len - row.length)).fill(69)
            )
          );
        } else {
          result.push(Array.from({ length: len }, () => 69));
        }
      }
      return result;
    }

    if (Array.isArray(incoming)) {
      const row = (incoming as number[])
        .slice(0, len)
        .concat(Array(Math.max(0, len - incoming.length)).fill(69));
      const result: number[][] = [row];
      for (let r = 1; r < rowCount; r++) {
        result.push(Array.from({ length: len }, () => 69));
      }
      return result;
    }

    return Array.from({ length: rowCount }, () =>
      Array.from({ length: len }, () => 69)
    );
  });

  // Multi-row notes: array of string arrays
  const [notes, setNotes] = useState<string[][]>(() => {
    const incoming = (data as any).notes;
    const rowCount = Math.max(1, Math.min(25, (data as any).rows ?? 1));
    const len = data.squares ?? 8;

    if (
      Array.isArray(incoming) &&
      incoming.length > 0 &&
      Array.isArray(incoming[0])
    ) {
      const result: string[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const row = (incoming as string[][])[r];
        if (Array.isArray(row)) {
          result.push(
            row.slice(0, len).concat(
              Array(Math.max(0, len - row.length)).fill('A4')
            )
          );
        } else {
          result.push(Array.from({ length: len }, () => 'A4'));
        }
      }
      return result;
    }

    if (Array.isArray(incoming)) {
      const row = (incoming as string[])
        .slice(0, len)
        .concat(Array(Math.max(0, len - incoming.length)).fill('A4'));
      const result: string[][] = [row];
      for (let r = 1; r < rowCount; r++) {
        result.push(Array.from({ length: len }, () => 'A4'));
      }
      return result;
    }

    return Array.from({ length: rowCount }, () =>
      Array.from({ length: len }, () => 'A4')
    );
  });

  // Multi-row frequencies: array of number arrays
  const [frequencies, setFrequencies] = useState<number[][]>(() =>
    notes.map((rowNotes) =>
      rowNotes.map((n) => {
        const midi = noteNameToMidi(n) ?? 69;
        return midiToFrequency(midi);
      })
    )
  );

  const [defaultPulseMs, setDefaultPulseMs] = useState<number>(
    () => data.defaultPulseMs ?? 100
  );
  const [gpuEnabled, setGpuEnabled] = useState<boolean>(
    () => (data as any).gpuEnabled ?? true
  );
  const [pulseLengths, setPulseLengths] = useState<number[]>(() => {
    const len = data.squares ?? 8;
    const incoming: number[] | undefined = (data as any).pulseLengths;
    if (Array.isArray(incoming)) {
      return incoming
        .slice(0, len)
        .concat(
          Array(Math.max(0, len - incoming.length)).fill(
            data.defaultPulseMs ?? 100
          )
        );
    }
    return Array.from({ length: len }, () => data.defaultPulseMs ?? 100);
  });
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  // Snapshot refs to freeze visuals when gpuEnabled is false
  const patternsSnapRef = useRef<boolean[][]>([]);
  const notesSnapRef = useRef<string[][]>([]);
  const freqSnapRef = useRef<number[][]>([]);
  const pulseSnapRef = useRef<number[]>([]);
  // Initialize snapshots once on mount
  useEffect(() => {
    patternsSnapRef.current = patterns;
    notesSnapRef.current = notes;
    freqSnapRef.current = frequencies;
    pulseSnapRef.current = pulseLengths;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep snapshots up to date only when GUI updates are enabled
  useEffect(() => {
    if (gpuEnabled) {
      patternsSnapRef.current = patterns;
      notesSnapRef.current = notes;
      freqSnapRef.current = frequencies;
      pulseSnapRef.current = pulseLengths;
    }
  }, [gpuEnabled, patterns, notes, frequencies, pulseLengths]);

  // Update node internals when rows change (for dynamic handles)
  useEffect(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [rows, nodeId, updateNodeInternals]);

  // Update knob range based on frequency type
  function updateKnobRange(type: FrequencyType) {
    const oldType = frequencyType;
    // Derive true frequencies from existing knob values using old scale
    const existingFrequencies = knobValues.map((row) =>
      row.map((kv) => knobToFrequency(kv, oldType))
    );

    // Apply new range metadata
    if (type === 'midi') {
      setKnobMin(24);
      setKnobMax(96);
    } else if (type === 'hz') {
      setKnobMin(0);
      setKnobMax(100);
    } else if (type === 'lfo') {
      setKnobMin(0);
      setKnobMax(250);
    }
    setFrequencyType(type);

    // Translate existing frequencies into new knob scale
    setKnobValues(
      existingFrequencies.map((row) =>
        row.map((f) => frequencyToKnobValue(f, type))
      )
    );
  }

  // Resize patterns, knobValues, notes when total or rows change
  useEffect(() => {
    setPatterns((p) => {
      let updated = p;
      // Adjust row count
      if (updated.length < rows) {
        updated = [
          ...updated,
          ...Array.from({ length: rows - updated.length }, () =>
            Array.from({ length: total }, () => false)
          )
        ];
      } else if (updated.length > rows) {
        updated = updated.slice(0, rows);
      }
      // Adjust step count per row
      return updated.map((row) => {
        if (row.length < total) {
          return [
            ...row,
            ...Array.from({ length: total - row.length }, () => false)
          ];
        }
        if (row.length > total) {
          return row.slice(0, total);
        }
        return row;
      });
    });

    setKnobValues((kv) => {
      let updated = kv;
      if (updated.length < rows) {
        updated = [
          ...updated,
          ...Array.from({ length: rows - updated.length }, () =>
            Array.from({ length: total }, () => 69)
          )
        ];
      } else if (updated.length > rows) {
        updated = updated.slice(0, rows);
      }
      return updated.map((row) => {
        if (row.length < total) {
          return [
            ...row,
            ...Array.from({ length: total - row.length }, () => 69)
          ];
        }
        if (row.length > total) {
          return row.slice(0, total);
        }
        return row;
      });
    });

    setNotes((n) => {
      let updated = n;
      if (updated.length < rows) {
        updated = [
          ...updated,
          ...Array.from({ length: rows - updated.length }, () =>
            Array.from({ length: total }, () => 'A4')
          )
        ];
      } else if (updated.length > rows) {
        updated = updated.slice(0, rows);
      }
      return updated.map((row) => {
        if (row.length < total) {
          return [
            ...row,
            ...Array.from({ length: total - row.length }, () => 'A4')
          ];
        }
        if (row.length > total) {
          return row.slice(0, total);
        }
        return row;
      });
    });

    setPulseLengths((pl) => {
      if (pl.length === total) return pl;
      if (pl.length < total) {
        return [
          ...pl,
          ...Array.from(
            { length: total - pl.length },
            () => defaultPulseMs
          )
        ];
      }
      return pl.slice(0, total);
    });
  }, [total, rows, defaultPulseMs]);

  // Recompute frequencies when knobValues or frequencyType change
  useEffect(() => {
    setFrequencies(
      knobValues.map((row) =>
        row.map((kv) => knobToFrequency(kv, frequencyType))
      )
    );
    setNotes(
      knobValues.map((row) =>
        row.map((kv) => {
          if (frequencyType === "midi") {
            return midiNoteToNoteName(Math.round(kv));
          }
          const freq = knobToFrequency(kv, frequencyType);
          const midi = Math.round(69 + 12 * Math.log2(freq / 440));
          return midiNoteToNoteName(Math.max(0, Math.min(127, midi)));
        })
      )
    );
  }, [knobValues, frequencyType]);

  // Emit params
  useEffect(() => {
    const payload = {
      ...data,
      squares: total,
      rows,
      patterns,
      notes,
      frequencies,
      knobValues,
      frequencyType,
      pulseLengths,
      defaultPulseMs,
      gpuEnabled
    };
    if (data.onChange) data.onChange(payload);
    if (nodeId) {
      eventBus.emit(nodeId + '.params.updateParams', {
        nodeid: nodeId,
        data: {
          squares: total,
          rows,
          patterns,
          notes,
          frequencies,
          knobValues,
          frequencyType,
          pulseLengths,
          defaultPulseMs,
          gpuEnabled
        }
      });
    }
  }, [
    total,
    rows,
    patterns,
    notes,
    frequencies,
    knobValues,
    frequencyType,
    pulseLengths,
    defaultPulseMs,
    gpuEnabled
  ]);

  // Listen for G input to toggle graphics updates via incoming edges
  useEffect(() => {
    if (!nodeId) return;
    const onCh1 = nodeId + '.G.receiveNodeOn';
    const onCh2 = nodeId + '.G.receivenodeOn';
    const offCh1 = nodeId + '.G.receiveNodeOff';
    const offCh2 = nodeId + '.G.receivenodeOff';
    const enable = () => setGpuEnabled(true);
    const disable = () => setGpuEnabled(false);
    EventBus.getInstance().subscribe(onCh1, enable);
    EventBus.getInstance().subscribe(onCh2, enable);
    EventBus.getInstance().subscribe(offCh1, disable);
    EventBus.getInstance().subscribe(offCh2, disable);
    return () => {
      EventBus.getInstance().unsubscribe(onCh1, enable as any);
      EventBus.getInstance().unsubscribe(onCh2, enable as any);
      EventBus.getInstance().unsubscribe(offCh1, disable as any);
      EventBus.getInstance().unsubscribe(offCh2, disable as any);
    };
  }, [nodeId]);

  const squares = useMemo(() => {
    if (rawTotal === '') return [0];
    return Array.from({ length: total }, (_, i) => i);
  }, [total, rawTotal]);

  const dynamicWidth = useMemo(() => {
    const minControlsWidth = 260;
    const base = 160;
    const per = 26;
    const max = 780;
    const stepsWidth = base + (total - 8) * per;
    return Math.min(max, Math.max(minControlsWidth, stepsWidth));
  }, [total]);

  // Memoized step box so only the changed step re-renders on state updates
  const StepBox = React.useMemo(() => React.memo(function StepBox(props: {
    index: number;
    rowIndex: number;
    enabled: boolean;
    selected: boolean;
    note: string;
    freq: number;
    pulseMs: number;
  }) {
    const { index, rowIndex, enabled, selected, note, freq, pulseMs } = props;
    const baseStyle: React.CSSProperties = {
      width: 28,
      minWidth: 28,
      height: 28,
      borderRadius: 6,
      cursor: 'pointer',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      flex: '0 0 28px',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: .5,
      padding: 2,
      boxSizing: 'border-box',
      transition: 'none'
    };
    if (enabled) {
      (baseStyle as any).background = 'linear-gradient(120deg,#ffffff,#dadff2)';
      (baseStyle as any).boxShadow = '0 0 0 1px #ffffffaa, 0 1px 3px -1px #00000055';
      (baseStyle as any).color = '#222';
    } else {
      (baseStyle as any).background = '#050507';
      (baseStyle as any).boxShadow = '0 0 0 1px #222';
      (baseStyle as any).color = '#222';
    }
    if (selected) {
      (baseStyle as any).border = '2px solid #00ff88';
      (baseStyle as any).boxShadow = ((baseStyle as any).boxShadow ? (baseStyle as any).boxShadow + ', ' : '') + '0 0 6px 2px #00ff8844';
    }
    return (
      <div
        data-index={index}
        data-row={rowIndex}
        className="step-box"
        style={baseStyle}
        title={`Row ${rowIndex + 1} Step ${index + 1} Note: ${note} Freq: ${freq}Hz Pulse: ${pulseMs}ms`}
      >
        <span style={{ lineHeight: 1 }}>{note}</span>
        <span style={{ fontSize: 8, opacity: .8 }}>{Math.round(freq)}</span>
      </div>
    );
  }, (prev, next) => (
    prev.index === next.index &&
    prev.rowIndex === next.rowIndex &&
    prev.enabled === next.enabled &&
    prev.selected === next.selected &&
    prev.note === next.note &&
    prev.freq === next.freq &&
    prev.pulseMs === next.pulseMs
  )), []);

  // Right-click note editing prompt
  function editNote(rowIndex: number, stepIndex: number) {
    const current = notes[rowIndex]?.[stepIndex] || 'A4';
    const entered = window.prompt(
      'Enter note (e.g., A4, C#3, Db3):',
      current
    );
    if (!entered) return;
    const cleaned = entered.trim();
    const midi = noteNameToMidi(cleaned);
    if (midi == null) {
      alert('Invalid note');
      return;
    }
    setKnobValues((kv) =>
      kv.map((row, ri) =>
        ri === rowIndex
          ? row.map((v, si) => (si === stepIndex ? midi : v))
          : row
      )
    );
  }

  // Update knob value for selected step in selected row
  function changeKnobValue(value: number) {
    if (selectedStep !== null) {
      setKnobValues((kv) =>
        kv.map((row, ri) =>
          ri === selectedRow
            ? row.map((v, si) => (si === selectedStep ? value : v))
            : row
        )
      );
    }
  }

  const addRow = () => {
    if (rows < 25) {
      setRows((r) => r + 1);
    }
  };

  const removeRow = () => {
    if (rows > 1) {
      setRows((r) => r - 1);
    }
  };

  const squareBtnStyle: React.CSSProperties = {
    background: '#1d2530',
    color: '#e6e8ea',
    border: '1px solid #303842',
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    fontSize: 10,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0
  };

  const inputStyle: React.CSSProperties = {
    width: 32,
    background: '#14191f',
    color: 'inherit',
    border: '1px solid #2a3139',
    borderRadius: 3,
    fontSize: 9,
    padding: '2px 3px',
    textAlign: 'center'
  };

  return (
    <div
      className="audio-node"
      style={{
        ...(data.style || {}),
        width: dynamicWidth,
        padding: '4px 6px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Rows */}
        {patterns.map((rowPattern, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3
            }}
          >
            <span
              style={{
                fontSize: 8,
                color: selectedRow === rowIndex ? '#00ff88' : '#888',
                width: 12,
                textAlign: 'center',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedRow(rowIndex)}
              title={`Select row ${rowIndex + 1}`}
            >
              {rowIndex + 1}
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 3,
                flexGrow: 1,
                overflowX: 'auto'
              }}
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest(
                  '.step-box'
                ) as HTMLElement | null;
                if (!el) return;
                e.stopPropagation();
                const stepIdx = Number(el.dataset.index);
                const rIdx = Number(el.dataset.row);
                if (Number.isNaN(stepIdx) || Number.isNaN(rIdx)) return;
                if (e.shiftKey || e.ctrlKey) {
                  setSelectedRow(rIdx);
                  setSelectedStep((prev) =>
                    prev === stepIdx ? null : stepIdx
                  );
                } else {
                  setPatterns((p) =>
                    p.map((row, ri) =>
                      ri === rIdx
                        ? row.map((v, si) =>
                            si === stepIdx ? !v : v
                          )
                        : row
                    )
                  );
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const el = (e.target as HTMLElement).closest(
                  '.step-box'
                ) as HTMLElement | null;
                if (!el) return;
                e.stopPropagation();
                const stepIdx = Number(el.dataset.index);
                const rIdx = Number(el.dataset.row);
                if (Number.isNaN(stepIdx) || Number.isNaN(rIdx)) return;
                if (e.altKey || e.ctrlKey || e.shiftKey) {
                  editNote(rIdx, stepIdx);
                } else {
                  setSelectedRow(rIdx);
                  setSelectedStep((prev) =>
                    prev === stepIdx ? null : stepIdx
                  );
                }
              }}
            >
              {squares.map((stepIdx) => (
                <StepBox
                  key={stepIdx}
                  index={stepIdx}
                  rowIndex={rowIndex}
                  enabled={
                    (gpuEnabled
                      ? patterns
                      : patternsSnapRef.current)[rowIndex]?.[stepIdx] ?? true
                  }
                  selected={
                    selectedRow === rowIndex && selectedStep === stepIdx
                  }
                  note={
                    (gpuEnabled
                      ? notes
                      : notesSnapRef.current)[rowIndex]?.[stepIdx] ?? 'A4'
                  }
                  freq={
                    (gpuEnabled
                      ? frequencies
                      : freqSnapRef.current)[rowIndex]?.[stepIdx] ?? 440
                  }
                  pulseMs={
                    (gpuEnabled
                      ? pulseLengths
                      : pulseSnapRef.current)[stepIdx] ?? 100
                  }
                />
              ))}
            </div>
          </div>
        ))}

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexWrap: 'wrap'
          }}
        >
          <label
            title="Toggle graphic updates"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 9,
              color: 'inherit'
            }}
          >
            <input
              type="checkbox"
              checked={gpuEnabled}
              onChange={(e) => setGpuEnabled(e.target.checked)}
              style={{
                width: 10,
                height: 10,
                accentColor: '#00d77a',
                cursor: 'pointer'
              }}
            />
            <span style={{ userSelect: 'none' }}>G</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={rawTotal}
            placeholder="1"
            title="Steps (1-128)"
            maxLength={4}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setRawTotal(raw);
              if (raw === '') {
                setTotal(1);
                return;
              }
              const num = parseInt(raw, 10);
              if (!isNaN(num)) {
                setTotal(Math.min(128, Math.max(1, num)));
              }
            }}
            style={inputStyle}
          />
          <input
            type="text"
            inputMode="numeric"
            value={defaultPulseMs === 0 ? '' : String(defaultPulseMs)}
            placeholder="100"
            title="Default pulse (ms) - empty uses 100"
            maxLength={4}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              if (raw === '') {
                setDefaultPulseMs(0);
                return;
              }
              const num = parseInt(raw, 10);
              if (!isNaN(num)) {
                setDefaultPulseMs(Math.max(1, Math.min(5000, num)));
              }
            }}
            style={{ ...inputStyle, width: 36 }}
          />
          <button
            style={{ ...squareBtnStyle, width: 40, fontSize: 8 }}
            title="Set all pulses"
            onClick={() =>
              setPulseLengths((pl) => pl.map(() => defaultPulseMs))
            }
          >
            SetAll
          </button>
          <select
            value={frequencyType}
            onChange={(e) =>
              updateKnobRange(e.target.value as FrequencyType)
            }
            style={{
              color: 'inherit',
              background: '#121212',
              border: '1px solid #555',
              borderRadius: 3,
              fontSize: 9,
              padding: '2px'
            }}
          >
            {['midi', 'hz', 'lfo'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              marginLeft: 4
            }}
          >
            <button
              style={squareBtnStyle}
              onClick={removeRow}
              disabled={rows <= 1}
              title="Remove row"
            >
              −
            </button>
            <span
              style={{ fontSize: 9, minWidth: 16, textAlign: 'center' }}
            >
              {rows}
            </span>
            <button
              style={squareBtnStyle}
              onClick={addRow}
              disabled={rows >= 25}
              title="Add row"
            >
              +
            </button>
          </div>
          {selectedStep !== null && (
            <>
              <span style={{ fontSize: 9, color: 'inherit' }}>
                R{selectedRow + 1} S{selectedStep + 1}:
              </span>
              <MidiKnob
                style={{ display: 'inline-block' }}
                min={knobMin}
                max={knobMax}
                value={knobValues[selectedRow]?.[selectedStep] || 69}
                onChange={(e) => changeKnobValue(e)}
              />
              <span style={{ fontSize: 9, color: 'inherit' }}>
                {notes[selectedRow]?.[selectedStep] || 'A4'} (
                {Math.round(
                  frequencies[selectedRow]?.[selectedStep] || 440
                )}
                Hz)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={
                  pulseLengths[selectedStep] === 0
                    ? ''
                    : String(pulseLengths[selectedStep] ?? '')
                }
                placeholder={String(defaultPulseMs || 100)}
                title={`Pulse for step ${selectedStep + 1} - empty uses default`}
                maxLength={4}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  if (raw === '') {
                    setPulseLengths((pl) =>
                      pl.map((v, idx) =>
                        idx === selectedStep ? 0 : v
                      )
                    );
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (!isNaN(num)) {
                    const clamped = Math.max(1, Math.min(5000, num));
                    setPulseLengths((pl) =>
                      pl.map((v, idx) =>
                        idx === selectedStep ? clamped : v
                      )
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const dir = e.key === 'ArrowUp' ? 1 : -1;
                    const current =
                      pulseLengths[selectedStep] || defaultPulseMs || 100;
                    setPulseLengths((pl) =>
                      pl.map((v, idx) =>
                        idx === selectedStep
                          ? Math.min(5000, Math.max(1, current + dir))
                          : v
                      )
                    );
                  }
                }}
                style={{ ...inputStyle, width: 36 }}
              />
            </>
          )}
        </div>
      </div>

      {/* Fixed handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="sync"
        style={{ top: '15%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="reset"
        style={{ top: '70%' }}
      />

      {/* Dynamic row output handles */}
      {Array.from({ length: rows }, (_, rowIndex) => (
        <Handle
          key={`row-${rowIndex}`}
          type="source"
          position={Position.Right}
          id={`row-${rowIndex}`}
          style={{
            top: `${40 + (rowIndex * 50) / Math.max(rows, 1)}%`,
            background:
              rowIndex === 0
                ? '#4a9eff'
                : `hsl(${(rowIndex * 360) / rows}, 70%, 50%)`
          }}
          title={`Row ${rowIndex + 1} output`}
        />
      ))}
    </div>
  );
};

export default SequencerFrequencyFlowNode;
