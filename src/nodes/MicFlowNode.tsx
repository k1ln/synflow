import React, { useEffect, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface MicFlowNodeData {
  id: string;
  label: string;
  selectedDeviceId?: string;
  devices?: MediaDeviceInfo[]; // stored for persistence (ids only really)
  autoStart?: boolean; // future use
  style: React.CSSProperties;
  onChange?: (data: any) => void; // provided by Flow addNode wrapper
}

interface MicFlowNodeProps { data: MicFlowNodeData; }

const MicFlowNode: React.FC<MicFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(data.selectedDeviceId);
  const [label, setLabel] = useState<string>(data.label || 'Mic');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const enumerate = useCallback(async () => {
    setLoading(true);
    setPermissionError(null);
    try {
      // Ensure permission prompt (some browsers require one getUserMedia call before enumerateDevices returns labels)
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        stream.getTracks().forEach(t => t.stop());
      }).catch(() => {/* ignore - user may have granted previously */});
      const list = await navigator.mediaDevices.enumerateDevices();
      const micDevices = list.filter(d => d.kind === 'audioinput');
      setDevices(micDevices);
      // If previously selected device no longer exists, clear it.
      if (selectedDeviceId && !micDevices.find(d => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(undefined);
      }
    } catch (e: any) {
      setPermissionError(e?.message || 'Permission denied / enumeration failed');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId]);

  // Initial enumerate
  useEffect(() => { enumerate(); }, [enumerate]);

  // Persist changes through onChange so VirtualMicNode can react via params.updateParams
  useEffect(() => {
    if (data.onChange) {
      data.onChange({
        ...data,
        label,
        selectedDeviceId,
      });
    }
  }, [label, selectedDeviceId]);

  // React to external style background changes through EventBus like other nodes (optional)
  useEffect(() => {
    const changeBackground = (color: string) => {
      if (!data.style) return;
      data.style = { ...data.style, background: color };
    };
    eventBus.subscribe(data.id + '.style.background', changeBackground);
    return () => eventBus.unsubscribe(data.id + '.style.background', changeBackground);
  }, [data, eventBus]);

  return (
    <div style={{ ...(data.style || {}), width: 180, padding: 6 }}>
      <Handle type="source" position={Position.Right} id="output" style={{ top: '50%', width: 10, height: 10 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>Device</span>
          <button
            type="button"
            onClick={() => enumerate()}
            title="Refresh devices"
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.65rem', lineHeight: 1, color: '#aaa' }}
          >↻</button>
          {loading && <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>(loading...)</span>}
        </div>
        <select
          value={selectedDeviceId || ''}
          onChange={e => setSelectedDeviceId(e.target.value || undefined)}
          style={{ background: '#1e1e1e', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: '0.65rem' }}
        >
          <option value="">(default)</option>
          {devices.map(d => (
            <option key={d.deviceId || d.label} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>
          ))}
        </select>
        {permissionError && <div style={{ color: '#f55', fontSize: '0.55rem' }}>{permissionError}</div>}
      </div>
    </div>
  );
};

export default React.memo(MicFlowNode);
