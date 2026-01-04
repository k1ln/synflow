import React, { useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import EventBus from '../sys/EventBus';

// Simple log node: shows last N events received on main-input.
// Data fields persisted: label, maxEntries
export interface LogFlowNodeData {
  label?: string;
  maxEntries?: number;
  style?: any;
}

const DEFAULT_MAX = 20;

export function LogFlowNode(props: NodeProps<any>) {
  const { id } = props;
  const rawData: any = props.data || {};
  const data = rawData as LogFlowNodeData & { onChange?: (patch: Partial<LogFlowNodeData>) => void };
  const eventBus = EventBus.getInstance();
  const [entries, setEntries] = useState<any[]>([]);
  const maxEntries = typeof data.maxEntries === 'number' ? data.maxEntries : DEFAULT_MAX;
  const label = data.label || '';

  useEffect(() => {
    const onName = id + '.main-input.receiveNodeOn';
    const offName = id + '.main-input.receiveNodeOff';

    const handlerOn = (payload: any) => {
      console.log('[LogFlowNode ON]', id, payload);
      setEntries((prev) => {
        const next = [{ t: Date.now(), type: 'on', payload }, ...prev];
        return next.slice(0, maxEntries);
      });
    };
    const handlerOff = (payload: any) => {
      console.log('[LogFlowNode OFF]', id, payload);
      setEntries((prev) => {
        const next = [{ t: Date.now(), type: 'off', payload }, ...prev];
        return next.slice(0, maxEntries);
      });
    };
    eventBus.subscribe(onName, handlerOn);
    eventBus.subscribe(offName, handlerOff);
    return () => {
      eventBus.unsubscribe(onName, handlerOn);
      eventBus.unsubscribe(offName, handlerOff);
    };
  }, [eventBus, id, maxEntries]);

  const updateData = (patch: Partial<LogFlowNodeData>) => {
    if (typeof data.onChange === 'function') {
      data.onChange(patch);
    }
  };

  return (
  <div style={{ ...(data.style || {}), padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <input
          type="text"
          value={label}
          placeholder="log name"
          onChange={(e) => updateData({ label: e.target.value })}
          style={{ flex: 1, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 3, fontSize: 11, padding: '2px 4px' }}
        />
        <input
          type="text"
          value={maxEntries}
          min={1}
          max={200}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) updateData({ maxEntries: v });
          }}
          style={{ width: 50, background: '#222', color: '#eee', border: '1px solid #444', borderRadius: 3, fontSize: 11, padding: '2px 4px' }}
          title="max entries"
        />
      </div>
      <div style={{
        fontSize: 10,
        lineHeight: '14px',
        maxHeight: 200,
        overflowY: 'auto',
        background: '#181818',
        border: '1px solid #333',
        padding: 4,
        borderRadius: 3
      }}>
        {entries.length === 0 && (
          <div style={{ opacity: 0.5 }}>no events</div>
        )}
        {entries.map((e, i) => (
          <details
            key={i}
            style={{
              marginBottom: 2,
              borderBottom: '1px solid #333'
            }}
          >
            <summary style={{
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              padding: '2px 0',
              listStyle: 'disclosure-closed'
            }}>
              <strong style={{
                color: e.type === 'on' ? '#6f6' : '#f66'
              }}>{e.type}</strong>
              {' '}
              <span style={{ opacity: 0.6 }}>
                {new Date(e.t).toLocaleTimeString()}.{String(e.t % 1000).padStart(3, '0')}
              </span>
            </summary>
            <pre style={{
              margin: '4px 0',
              padding: '6px 8px',
              background: '#111',
              border: '1px solid #444',
              borderRadius: 3,
              overflow: 'auto',
              maxHeight: 120,
              fontSize: 9,
              lineHeight: '13px',
              textAlign: 'left',
              whiteSpace: 'pre',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace'
            }}>
              <code style={{
                color: '#0cf',
                display: 'block',
                textAlign: 'left'
              }}>
                {typeof e.payload === 'object'
                  ? JSON.stringify(e.payload, null, 2)
                  : String(e.payload)}
              </code>
            </pre>
          </details>
        ))}
      </div>
      <Handle id="main-input" type="target" position={Position.Left} style={{ background: '#888' }} />
    </div>
  );
}

export default LogFlowNode;
