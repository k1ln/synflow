import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback
} from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface SequencerFlowNodeData {
  label?: string;
  squares?: number; // total number of steps per row
  rows?: number; // number of rows (1-25)
  activeIndex?: number; // current pointer position
  onChange?: (d: any) => void;
  style?: React.CSSProperties;
  gpuEnabled?: boolean; // if false, graphic pointer won't update
}

export interface SequencerFlowNodeProps {
  id?: string;
  data: SequencerFlowNodeData & { id?: string };
}

// Multi-row step sequencer with dynamic outputs per row
const SequencerFlowNode: React.FC<SequencerFlowNodeProps> = ({
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

  const activeRef = useRef<number>(data.activeIndex ?? 0);
  const [viewActive, setViewActive] = useState<number>(activeRef.current);
  const rafIdRef = useRef<number | null>(null);

  const scheduleActiveUpdate = useCallback(() => {
    if (!gpuRef.current) return;
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      setViewActive((prev) => {
        const next = activeRef.current;
        return prev !== next ? next : prev;
      });
    });
  }, []);

  const [rawTotal, setRawTotal] = useState<string>(
    () => String(data.squares ?? 8)
  );
  const [label] = useState<string>(data.label || 'Sequencer');
  const [gpuEnabled, setGpuEnabled] = useState<boolean>(
    () => (data as any).gpuEnabled ?? true
  );
  const gpuRef = useRef<boolean>(gpuEnabled);

  const [pulseLengths, setPulseLengths] = useState<number[]>(() => {
    const incoming: number[] | undefined = (data as any).pulseLengths;
    const len = total;
    if (Array.isArray(incoming)) {
      return incoming
        .slice(0, len)
        .concat(
          Array(Math.max(0, len - incoming.length)).fill(100)
        );
    }
    return Array.from({ length: len }, () => 100);
  });

  const [defaultPulseMs, setDefaultPulseMs] = useState<number>(
    () => (data as any).defaultPulseMs ?? 100
  );
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number>(0);

  // Multi-row patterns: array of boolean arrays
  const [patterns, setPatterns] = useState<boolean[][]>(() => {
    const incoming: boolean[][] | boolean[] | undefined =
      (data as any).patterns ?? (data as any).pattern;
    const rowCount = Math.max(
      1,
      Math.min(25, (data as any).rows ?? 1)
    );

    // Check if it's already a 2D array
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
            row
              .slice(0, total)
              .concat(
                Array(Math.max(0, total - row.length)).fill(false)
              )
          );
        } else {
          result.push(Array.from({ length: total }, () => false));
        }
      }
      return result;
    }

    // Legacy 1D pattern - convert to single row
    if (Array.isArray(incoming)) {
      const row = (incoming as boolean[])
        .slice(0, total)
        .concat(
          Array(Math.max(0, total - incoming.length)).fill(false)
        );
      const result: boolean[][] = [row];
      for (let r = 1; r < rowCount; r++) {
        result.push(Array.from({ length: total }, () => false));
      }
      return result;
    }

    // Default: all false (black/not selected)
    return Array.from({ length: rowCount }, () =>
      Array.from({ length: total }, () => false)
    );
  });

  // Adjust patterns when total or rows change
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
      updated = updated.map((row) => {
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
      return updated;
    });
  }, [total, rows]);

  // Update node internals when rows change (for dynamic handles)
  useEffect(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [rows, nodeId, updateNodeInternals]);

  // ensure bounds (clamp instead of wrap to avoid apparent reset during resizes)
  useEffect(() => {
    if (activeRef.current >= total) {
      activeRef.current = Math.max(0, total - 1);
      scheduleActiveUpdate();
    }
  }, [total, scheduleActiveUpdate]);

  // Listen for virtual updates to keep UI playhead in sync without causing loops
  useEffect(() => {
    if (!nodeId) return;
    const ch = 'FlowNode.' + nodeId + '.params.updateParams';
    const handler = (p: any) => {
      const d = p?.data || p;
      if (typeof d?.activeIndex === 'number') {
        // Update ref immediately, coalesce UI state via rAF
        activeRef.current = d.activeIndex;
        scheduleActiveUpdate();
      }
    };
    eventBus.subscribe(ch, handler);
    return () => { eventBus.unsubscribe(ch, handler as any); };
  }, [nodeId, scheduleActiveUpdate]);

  // Listen for G input to toggle graphics updates via incoming edges
  useEffect(() => {
    if (!nodeId) return;
    const onCh = nodeId + '.G.receiveNodeOn';
    const onCh2 = nodeId + '.G.receivenodeOn';
    const offCh = nodeId + '.G.receiveNodeOff';
    const offCh2 = nodeId + '.G.receivenodeOff';
    const enable = () => setGpuEnabled(true);
    const disable = () => setGpuEnabled(false);
    eventBus.subscribe(onCh, enable);
    eventBus.subscribe(onCh2, enable);
    eventBus.subscribe(offCh, disable);
    eventBus.subscribe(offCh2, disable);
    return () => {
      eventBus.unsubscribe(onCh, enable as any);
      eventBus.unsubscribe(onCh2, enable as any);
      eventBus.unsubscribe(offCh, disable as any);
      eventBus.unsubscribe(offCh2, disable as any);
    };
  }, [nodeId]);


  // Include patterns/rows updates in onChange and emit event bus params
  useEffect(() => {
    const payload = {
      ...data,
      squares: total,
      rows,
      label,
      patterns,
      defaultPulseMs,
      gpuEnabled
    };
    data.onChange?.(payload);
    if (nodeId) {
      eventBus.emit(nodeId + '.params.updateParams', {
        nodeid: nodeId,
        data: {
          squares: total,
          rows,
          patterns,
          defaultPulseMs,
          gpuEnabled
        }
      });
    }
  }, [total, rows, label, patterns, defaultPulseMs, gpuEnabled]);

  // Include pulseLengths in separate effect
  useEffect(() => {
    const payload = {
      ...data,
      squares: total,
      rows,
      label,
      patterns,
      pulseLengths,
      defaultPulseMs
    };
    data.onChange?.(payload);
    if (nodeId) {
      eventBus.emit(nodeId + '.params.updateParams', {
        nodeid: nodeId,
        data: {
          squares: total,
          rows,
          patterns,
          pulseLengths,
          defaultPulseMs
        }
      });
    }
  }, [pulseLengths, defaultPulseMs]);

  // Sync gpuEnabled to ref; immediate pointer sync when enabling, cancel pending rAF when disabling
  useEffect(() => {
    gpuRef.current = gpuEnabled;
    if (gpuEnabled) {
      setViewActive(activeRef.current);
    } else if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, [gpuEnabled]);

  // Cleanup any pending animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // If input cleared, still show exactly one placeholder step visually
  const squares = useMemo(() => {
    if (rawTotal === '') return [0];
    return Array.from({ length: total }, (_, i) => i);
  }, [total, rawTotal]);

  const dynamicWidth = useMemo(() => {
    const minControlsWidth = 260;
    const base = 130;
    const per = 20;
    const max = 620;
    const stepsWidth = base + (total - 8) * per;
    return Math.min(max, Math.max(minControlsWidth, stepsWidth));
  }, [total]);

  useEffect(() => {
    setPulseLengths((pl) => {
      if (pl.length === total) return pl;
      if (pl.length < total) {
        return [
          ...pl,
          ...Array.from({ length: total - pl.length }, () => 100)
        ];
      }
      return pl.slice(0, total);
    });
  }, [total]);

  // Memoized StepDot with row index
  const StepDot = React.useMemo(
    () =>
      React.memo(
        function StepDot(props: {
          index: number;
          rowIndex: number;
          enabled: boolean;
          selected: boolean;
          pointer: boolean;
          pulseMs: number;
        }) {
          const {
            index,
            rowIndex,
            enabled,
            selected,
            pointer,
            pulseMs
          } = props;
          const style: React.CSSProperties = {
            width: 14,
            minWidth: 14,
            height: 14,
            borderRadius: 3,
            cursor: 'pointer',
            userSelect: 'none',
            display: 'flex',
            flex: '0 0 14px',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            fontWeight: 600,
            transition: 'none',
            background: pointer
              ? 'linear-gradient(120deg,#2aff9a,#00d77a)'
              : enabled
                ? 'linear-gradient(120deg,#ffffff,#dadff2)'
                : '#050507',
            boxShadow: pointer
              ? '0 0 0 1px #2aff9a, 0 0 6px 1px #00ff8840'
              : enabled
                ? '0 0 0 1px #ffffffaa, 0 1px 2px -1px #00000055'
                : '0 0 0 1px #222',
            color: pointer ? '#0b2a1e' : '#222',
            border: selected ? '1px solid #ff2d2d' : undefined
          };
          return (
            <div
              className="step-dot"
              data-index={index}
              data-row={rowIndex}
              style={style}
              draggable={false}
              title={`Row ${rowIndex + 1} Step ${index + 1}${enabled ? '' : ' (off)'} Pulse: ${pulseMs}ms`}
            />
          );
        },
        (a, b) =>
          a.index === b.index &&
          a.rowIndex === b.rowIndex &&
          a.enabled === b.enabled &&
          a.selected === b.selected &&
          a.pointer === b.pointer &&
          a.pulseMs === b.pulseMs
      ),
    []
  );

  const advance = () => {
    if (nodeId) {
      eventBus.emit(nodeId + '.advance.receiveNodeOn', {});
    } else {
      activeRef.current = (activeRef.current + 1) % total;
      scheduleActiveUpdate();
    }
  };

  const reset = () => {
    if (nodeId) {
      eventBus.emit(nodeId + '.reset.receiveNodeOn', {});
    } else {
      activeRef.current = 0;
      scheduleActiveUpdate();
    }
  };

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

  const handleRowClick = (
    rowIndex: number,
    stepIndex: number,
    e: React.MouseEvent
  ) => {
    if (!e.altKey && !e.ctrlKey && !e.shiftKey) {
      setPatterns((p) =>
        p.map((row, ri) =>
          ri === rowIndex
            ? row.map((v, si) => (si === stepIndex ? !v : v))
            : row
        )
      );
    } else {
      setSelectedRow(rowIndex);
      setSelectedStep((prev) =>
        prev === stepIndex && selectedRow === rowIndex ? null : stepIndex
      );
    }
  };

  // Compact layout: multiple rows + controls
  return (
    <div
      className="audio-node"
      style={{
        ...(data.style || {}),
        width: dynamicWidth,
        padding: '4px 6px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                color: '#888',
                width: 12,
                textAlign: 'center'
              }}
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
              onMouseDown={(e) => {
                const el = (e.target as HTMLElement).closest('.step-dot');
                if (el) e.stopPropagation();
              }}
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest(
                  '.step-dot'
                ) as HTMLElement | null;
                if (!el) return;
                e.stopPropagation();
                const i = Number(el.dataset.index);
                const r = Number(el.dataset.row);
                if (Number.isNaN(i) || Number.isNaN(r)) return;
                handleRowClick(r, i, e);
              }}
              onContextMenu={(e) => {
                const el = (e.target as HTMLElement).closest(
                  '.step-dot'
                ) as HTMLElement | null;
                if (!el) return;
                e.preventDefault();
                e.stopPropagation();
                const i = Number(el.dataset.index);
                const r = Number(el.dataset.row);
                if (Number.isNaN(i) || Number.isNaN(r)) return;
                setSelectedRow(r);
                setSelectedStep((prev) =>
                  prev === i && selectedRow === r ? null : i
                );
              }}
            >
              {squares.map((i) => (
                <StepDot
                  key={i}
                  index={i}
                  rowIndex={rowIndex}
                  enabled={rowPattern[i] ?? true}
                  selected={selectedRow === rowIndex && selectedStep === i}
                  pointer={gpuEnabled && i === viewActive}
                  pulseMs={pulseLengths[i] ?? 10}
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
          <button style={squareBtnStyle} onClick={advance} title="Advance">
            ▶
          </button>
          <button style={squareBtnStyle} onClick={reset} title="Reset">
            ↺
          </button>
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
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                const current =
                  rawTotal === '' ? 1 : parseInt(rawTotal, 10) || 1;
                const next = Math.min(128, Math.max(1, current + dir));
                setTotal(next);
                setRawTotal(String(next));
              }
            }}
            onBlur={() => {
              if (rawTotal === '') setRawTotal('1');
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
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                const current = defaultPulseMs || 100;
                setDefaultPulseMs(
                  Math.min(5000, Math.max(1, current + dir))
                );
              }
            }}
            style={inputStyle}
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
              style={inputStyle}
            />
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
        id="advance"
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

export default SequencerFlowNode;
