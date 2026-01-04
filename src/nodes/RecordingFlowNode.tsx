import React, { useEffect, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface RecordingFlowNodeData {
  id: string;
  label?: string;
  isRecording?: boolean;
  recordedMs?: number;
  recordings?: { id: string; name: string; size: number; createdAt: string }[]; // optional local list snapshot
  style?: React.CSSProperties;
  onChange?: (d: any) => void;
  holdMode?: boolean; // true = press & hold to record, false = toggle (multi-push)
  _internalToggleState?: boolean; // for edge cases when external events drive toggle
}

interface RecordingFlowNodeProps { data: RecordingFlowNodeData; }

/**
 * UI node controlling a VirtualRecordingNode. Provides:
 * - main-input (audio pass-through)
 * - trigger input (target) for external start/stop events (receiveNodeOn / receiveNodeOff)
 * - output (pass-through forward of audio)
 * - button to toggle recording
 */
const RecordingFlowNode: React.FC<RecordingFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [isRecording, setIsRecording] = useState<boolean>(!!data.isRecording);
  const [holdMode, setHoldMode] = useState<boolean>(!!data.holdMode);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tickActive, setTickActive] = useState<boolean>(false);

  // Sync outward (excluding high-frequency elapsed updates)
  useEffect(() => {
    data.onChange?.({ ...data, isRecording, holdMode });
  }, [isRecording, holdMode]);

  // Toggle helper defined before effects so effects can depend on it
  const toggleRecording = useCallback((force?: boolean) => {
    const next = typeof force === 'boolean' ? force : !isRecording;
    if (next === isRecording) return; // ignore redundant
    setError(null);
    setIsRecording(next);
    if (next) {
      setElapsedMs(0);
      eventBus.emit(data.id + '.control.start', { id: data.id });
    } else {
      eventBus.emit(data.id + '.control.stop', { id: data.id });
    }
  }, [isRecording, data.id, eventBus]);

  // Listen for external trigger event

  // Listen for params.updateParams (general node data updates from Flow.tsx)
  useEffect(() => {
    const paramsCh = "FlowNode." + data.id + '.params.updateParams';
    const handler = (payload: any) => {
      if (payload?.data) {
        if (typeof payload.data.isRecording === 'boolean') {
          setIsRecording(payload.data.isRecording);
        }
      }
    };
    eventBus.subscribe(paramsCh, handler);
    return () => eventBus.unsubscribe(paramsCh, handler);
  }, [data.id, eventBus]);

  // Observe virtual node emitted status updates (optional future extensibility)
  useEffect(() => {
    const statusCh = "FlowNode." + data.id + '.status.update';
    const handler = (p: any) => {
      if (typeof p?.elapsedMs === 'number') {
        setElapsedMs(p.elapsedMs);
      }
      if (typeof p?.recording === 'boolean') {
        setIsRecording(p.recording);
      }
      if (p?.error) {
        setError(p.error);
      }
    };
    eventBus.subscribe(statusCh, handler);
    return () => {
      eventBus.unsubscribe(statusCh, handler as any);
    };
  }, [data.id, eventBus]);

  // local timer for displaying elapsed time
  useEffect(() => {
    if (!isRecording) { setTickActive(false); return; }
    setTickActive(true);
  }, [isRecording]);
  useEffect(() => {
    if (!tickActive) return;
    const startedAt = performance.now() - elapsedMs;
    let raf: number;
    const loop = () => {
      setElapsedMs(Math.round(performance.now() - startedAt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tickActive]);

  // (moved earlier)

  if (!data.style) {
    data.style = {
      padding: '8px',
      border: '1px solid #2a3139',
      borderRadius: 6,
      width: 160,
      background: '#1f1f1f',
      color: '#eee'
    };
  }

  return (
    <div style={data.style}>
      {/* Pass-through input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: '30%' }}
      />
      {/* External trigger input */}
      <Handle
        type="target"
        position={Position.Left}
        id="record"
        style={{ top: '70%' }}
        title={
          holdMode
            ? 'Hold: receiveNodeOn starts, receiveNodeOff stops'
            : 'Toggle: receiveNodeOn or receiveNodeOff toggles'
        }
      />
      {/* Output (pass-through) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: '50%' }}
      />
      <button
        onMouseDown={(e) => {
          if (holdMode) {
            e.preventDefault();
            toggleRecording(true);
          }
        }}
        onMouseUp={(e) => {
          if (holdMode) {
            e.preventDefault();
            toggleRecording(false);
          }
        }}
        onClick={(e) => {
          if (!holdMode) {
            e.preventDefault();
            toggleRecording();
          }
        }}
        style={{
          padding: '4px 8px',
          fontSize: 11,
          background: isRecording
            ? 'linear-gradient(90deg,#ff4d4d,#cc0000)'
            : '#222',
          color: isRecording ? '#fff' : '#ddd',
          border: '1px solid ' + (isRecording ? '#ff6b6b' : '#444'),
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 600,
          width: '100%'
        }}
        title={
          holdMode
            ? 'Press & hold to record'
            : 'Click to toggle'
        }
      >
        {isRecording ? '● REC' : '○ Rec'}
      </button>
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 11
        }}
      >
        <span style={{ fontFamily: 'monospace', opacity: 0.85 }}>
          {isRecording
            ? (elapsedMs / 1000).toFixed(2) + 's'
            : elapsedMs > 0
              ? (elapsedMs / 1000).toFixed(2) + 's'
              : 'Idle'}
        </span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            cursor: 'pointer',
            userSelect: 'none'
          }}
          title="Hold mode: press to start, release to stop"
        >
          <input
            type="checkbox"
            checked={holdMode}
            onChange={(e) => setHoldMode(e.target.checked)}
            style={{ margin: 0, width: 12, height: 12 }}
          />
          Hold
        </label>
      </div>
      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 10, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default React.memo(RecordingFlowNode);
