import React, { useState, useEffect, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface SpeedDividerFlowNodeData {
  id: string;
  divider: number;
  multiplier: number;
  incomingBpm?: number;
  style?: React.CSSProperties;
  onChange?: (d: any) => void;
}

interface SpeedDividerFlowNodeProps {
  data: SpeedDividerFlowNodeData;
}

const SpeedDividerFlowNode: React.FC<SpeedDividerFlowNodeProps> = ({
  data
}) => {
  const eventBus = EventBus.getInstance();
  const [divider, setDivider] = useState<number>(data.divider || 1);
  const [multiplier, setMultiplier] = useState<number>(
    data.multiplier || 1
  );
  const [hitCount, setHitCount] = useState<number>(0);
  const [incomingBpm, setIncomingBpm] = useState<number>(
    data.incomingBpm || 0
  );

  useEffect(() => {
    data.onChange?.({ ...data, divider, multiplier, incomingBpm });
  }, [divider, multiplier, incomingBpm]);

  useEffect(() => {
    const ch = 'FlowNode.' + data.id + '.params.updateParams';
    const handler = (payload: any) => {
      if (payload?.data) {
        if (typeof payload.data.divider === 'number') {
          setDivider(payload.data.divider);
        }
        if (typeof payload.data.multiplier === 'number') {
          setMultiplier(payload.data.multiplier);
        }
      }
    };
    eventBus.subscribe(ch, handler);
    return () => eventBus.unsubscribe(ch, handler);
  }, [data.id, eventBus]);

  // Listen for hit count updates from virtual node
  useEffect(() => {
    const ch = data.id + '.status.hitCount';
    const handler = (payload: any) => {
      if (typeof payload?.count === 'number') {
        setHitCount(payload.count);
      }
    };
    eventBus.subscribe(ch, handler);
    return () => eventBus.unsubscribe(ch, handler);
  }, [data.id, eventBus]);

  // Listen for incoming BPM updates from virtual node
  useEffect(() => {
    const ch = data.id + '.status.bpm';
    const handler = (payload: any) => {
      if (typeof payload?.bpm === 'number') {
        setIncomingBpm(Math.round(payload.bpm));
      }
    };
    eventBus.subscribe(ch, handler);
    return () => eventBus.unsubscribe(ch, handler);
  }, [data.id, eventBus]);

  const handleDividerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
      setDivider(v);
      setHitCount(0);
    },
    []
  );

  const handleMultiplierChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
      setMultiplier(v);
    },
    []
  );

  if (!data.style) {
    data.style = {
      padding: '8px',
      border: '1px solid #2a3139',
      borderRadius: 6,
      width: 120,
      background: '#1f1f1f',
      color: '#eee'
    };
  }

  return (
    <div style={data.style}>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ top: '25%' }}
      />
      {/* Divider value handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="divider-input"
        style={{ top: '50%' }}
      />
      {/* Multiplier value handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="multiplier-input"
        style={{ top: '75%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: '50%' }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6
        }}
      >
        <span style={{ fontSize: 10, width: 24 }}>÷</span>
        <input
          type="number"
          min={1}
          max={10}
          value={divider}
          onChange={handleDividerChange}
          style={{
            width: 40,
            fontSize: 11,
            padding: '2px 4px',
            background: '#333',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 3
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            opacity: 0.7
          }}
        >
          {hitCount}/{divider}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <span style={{ fontSize: 10, width: 24 }}>×</span>
        <input
          type="number"
          min={1}
          max={10}
          value={multiplier}
          onChange={handleMultiplierChange}
          style={{
            width: 40,
            fontSize: 11,
            padding: '2px 4px',
            background: '#333',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 3
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontFamily: 'monospace',
            opacity: 0.6
          }}
        >
          {incomingBpm > 0 ? incomingBpm + ' bpm' : '--'}
        </span>
      </div>
    </div>
  );
};

export default React.memo(SpeedDividerFlowNode);
