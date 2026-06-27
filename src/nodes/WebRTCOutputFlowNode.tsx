import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

interface SessionConfig {
  id: string;
  name: string;
  direction: 'capture' | 'playback';
  description?: string;
}

interface SessionState {
  config: SessionConfig;
}

export interface WebRTCOutputFlowNodeData {
  id: string;
  label?: string;
  sessionId?: string;
  serverUrl?: string;
  connectionState?: string;
  lastError?: string;
  style?: React.CSSProperties;
  onChange?: (data: any) => void;
}

interface WebRTCOutputFlowNodeProps {
  data: WebRTCOutputFlowNodeData;
}

const DEFAULT_URL = 'http://localhost:8787';

function normalizeBaseUrl(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

const WebRTCOutputFlowNode: React.FC<WebRTCOutputFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [label, setLabel] = useState<string>(data.label || 'WebRTC Out');
  const [serverUrlInput, setServerUrlInput] = useState<string>(data.serverUrl || DEFAULT_URL);
  const [sessionId, setSessionId] = useState<string | undefined>(data.sessionId);
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>(data.connectionState || 'disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(data.lastError ?? null);

  useEffect(() => {
    if (data.label && data.label !== label) {
      setLabel(data.label);
    }
  }, [data.label]);

  useEffect(() => {
    if (data.sessionId !== undefined && data.sessionId !== sessionId) {
      setSessionId(data.sessionId);
    }
  }, [data.sessionId]);

  useEffect(() => {
    if (data.serverUrl && data.serverUrl !== serverUrlInput) {
      setServerUrlInput(data.serverUrl);
    }
  }, [data.serverUrl]);

  useEffect(() => {
    if (data.connectionState && data.connectionState !== connectionState) {
      setConnectionState(data.connectionState);
    }
  }, [data.connectionState]);

  useEffect(() => {
    if (data.lastError !== undefined && data.lastError !== connectionError) {
      setConnectionError(data.lastError ?? null);
    }
  }, [data.lastError]);

  const baseUrl = useMemo(() => normalizeBaseUrl(serverUrlInput), [serverUrlInput]);

  useEffect(() => {
    if (!data.onChange) return;
    data.onChange({
      ...data,
      label,
      serverUrl: baseUrl || '',
      sessionId,
      connectionState,
      lastError: connectionError ?? undefined,
    });
  }, [label, baseUrl, sessionId, connectionState, connectionError]);

  const loadSessions = useCallback(async () => {
    if (!baseUrl) {
      setFetchError('Enter a server URL');
      setSessions([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${baseUrl}/api/sessions`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as SessionState[];
      const list = Array.isArray(json) ? json.filter((item) => item?.config?.direction === 'playback') : [];
      setSessions(list);
      setSessionId((prev) => {
        if (prev && !list.find((item) => item.config.id === prev)) {
          return undefined;
        }
        return prev;
      });
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    loadSessions().catch(() => undefined);
  }, [loadSessions]);

  useEffect(() => {
    const statusChannel = `FlowNode.${data.id}.status.update`;
    const paramsChannel = `FlowNode.${data.id}.params.updateParams`;

    const handleStatus = (payload: any) => {
      if (typeof payload?.connectionState === 'string') {
        const next = payload.connectionState;
        setConnectionState((prev) => (prev === next ? prev : next));
      }
      if (Object.prototype.hasOwnProperty.call(payload || {}, 'error')) {
        const nextError = payload?.error ?? null;
        setConnectionError((prev) => (prev === nextError ? prev : nextError));
      }
    };

    const handleParams = (payload: any) => {
      const nextState = payload?.data?.connectionState;
      if (typeof nextState === 'string') {
        setConnectionState((prev) => (prev === nextState ? prev : nextState));
      }
      if (Object.prototype.hasOwnProperty.call(payload?.data || {}, 'lastError')) {
        const nextError = payload?.data?.lastError ?? null;
        setConnectionError((prev) => (prev === nextError ? prev : nextError));
      }
      if (payload?.data?.sessionId) {
        const nextSession = payload.data.sessionId as string | undefined;
        setSessionId((prev) => (prev === nextSession ? prev : nextSession));
      }
    };

    eventBus.subscribe(statusChannel, handleStatus);
    eventBus.subscribe(paramsChannel, handleParams);
    return () => {
      eventBus.unsubscribe(statusChannel, handleStatus);
      eventBus.unsubscribe(paramsChannel, handleParams);
    };
  }, [data.id, eventBus]);

  useEffect(() => {
    const changeBackground = (color: string) => {
      if (!data.style) return;
      data.style = { ...data.style, background: color };
    };
    eventBus.subscribe(`${data.id}.style.background`, changeBackground);
    return () => eventBus.unsubscribe(`${data.id}.style.background`, changeBackground);
  }, [data, eventBus]);

  const statusLabel = connectionState ? connectionState.toUpperCase() : 'UNKNOWN';

  return (
    <div style={{ ...(data.style || {}), width: 240, padding: 8 }}>
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 20, width: 10, height: 10 }} />
      <div className="audio-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span><b>WebRTC Out</b></span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="audio-label-input"
          style={{ flex: 1, color: data.style?.color || '#eee' }}
        />
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: '0.6rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          WebRTC Server URL
          <input
            type="text"
            value={serverUrlInput}
            onChange={(e) => setServerUrlInput(e.target.value)}
            onBlur={() => setServerUrlInput((prev) => normalizeBaseUrl(prev) || prev)}
            placeholder={DEFAULT_URL}
            style={{ background: '#1e1e1e', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: '0.65rem' }}
          />
        </label>
        <label style={{ fontSize: '0.6rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Session {loading && <span style={{ fontSize: '0.5rem', opacity: 0.6 }}> (loading...)</span>}
          <select
            value={sessionId || ''}
            onChange={(e) => setSessionId(e.target.value || undefined)}
            disabled={!sessions.length}
            style={{ background: '#1e1e1e', color: '#eee', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: '0.65rem' }}
          >
            <option value="">(select playback session)</option>
            {sessions.map((item) => (
              <option key={item.config.id} value={item.config.id}>
                {item.config.name || item.config.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => loadSessions().catch(() => undefined)}
          style={{ fontSize: '0.6rem', background: 'transparent', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }}
        >Refresh</button>
        <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>Status: {statusLabel}</div>
        {fetchError && <div style={{ color: '#f55', fontSize: '0.55rem' }}>{fetchError}</div>}
        {connectionError && !fetchError && <div style={{ color: '#f55', fontSize: '0.55rem' }}>{connectionError}</div>}
        {!connectionError && !fetchError && <div style={{ fontSize: '0.55rem', opacity: 0.6 }}>Send audio into the left handle to stream this session to the WebRTC server.</div>}
      </div>
    </div>
  );
};

export default React.memo(WebRTCOutputFlowNode);
