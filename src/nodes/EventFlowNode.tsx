import React, { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import EventBus from "../sys/EventBus";

export type EventNodeProps = {
  data: {
    id: string;
    listener?: string; // selected event name to listen to
    functionCode: string; // transformation/emit code like Function node
    lastPayload?: any;
    onChange: (data: any) => void;
  };
};

const EventFlowNode: React.FC<EventNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [listener, setListener] = useState<string>(data.listener || "");
  const [functionCode, setFunctionCode] = useState<string>(data.functionCode || "return { on:main, off:main }; // expected to set 'out' or return value");
  const [available, setAvailable] = useState<string[]>([]);
  const [lastPayload, setLastPayload] = useState<any>(data.lastPayload || null);
  const updatingRef = useRef(false);
  const pendingRef = useRef<any>(null);

  const refresh = () => {
    try {
      const names = eventBus.listEvents() || [];
      // Only show receive/send node events and global app events
      setAvailable(names);
    } catch (e) {
      setAvailable([]);
    }
  };

  useEffect(() => { refresh(); }, []);

  // subscribe to chosen listener
  useEffect(() => {
    if (!listener) return;
    const handler = (payload: any) => {
      setLastPayload(payload);
      // auto emit pass-through when triggered from outside
      // This is only for preview; actual graph emit happens via VirtualEventNode
    };
    eventBus.subscribe(listener, handler);
    return () => { eventBus.unsubscribe(listener, handler); };
  }, [listener]);

  // persist changes
  useEffect(() => {
    data.onChange?.({ ...data, listener, functionCode, lastPayload });
  }, [listener, functionCode, lastPayload]);

  const emitPreview = () => {
    try {
      const func = new Function("main", `${functionCode}`);
      const res = func(lastPayload);
      pendingRef.current = res;
      updatingRef.current = true;
    } catch (e) {
      pendingRef.current = { error: String(e) };
      updatingRef.current = true;
    }
  };

  return (
    <div style={{ padding: 10, border: "1px solid #2a3139", borderRadius: 5, width: 360, background: "#1f1f1f", color: "#eee" }}>
      <Handle type="target" position={Position.Left} id="main-input" style={{ top: 32, width: 10, height: 10 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ minWidth: 80 }}>Listener</label>
        <select value={listener} onChange={(e)=> setListener(e.target.value)} style={{ flex:1, background:'#111', color:'#eee', border:'1px solid #333', padding:'6px 8px', borderRadius:6 }}>
          <option value="">-- choose --</option>
          {available.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button onClick={refresh} title="Refresh listeners" style={{ padding:'6px 10px', background:'#222', color:'#ccc', border:'1px solid #333', borderRadius:6, cursor:'pointer' }}>↻</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize:12, opacity:.8, marginBottom:4 }}>Last payload</div>
        <div style={{ fontFamily:'monospace', fontSize:12, background:'#141414', border:'1px solid #333', borderRadius:4, padding:6, maxHeight:120, overflow:'auto' }}>
          {lastPayload ? JSON.stringify(lastPayload, null, 2) : '—'}
        </div>
      </div>

      <div>
        <label style={{ color: "#fff", marginBottom: 5, display: "block" }}>Function Editor:</label>
        <CodeMirror
          value={functionCode}
          extensions={[javascript()]}
          theme="dark"
          onChange={(value) => setFunctionCode(value)}
          onKeyDown={(event) => { event.stopPropagation(); }}
        />
      </div>

      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button onClick={emitPreview} style={{ padding:'6px 12px', background:'#333', color:'#eee', border:'1px solid #444', borderRadius:6, cursor:'pointer' }}>Test transform</button>
        <div style={{ fontSize:12, opacity:.7, alignSelf:'center' }}>External trigger via window.flowSynth?.emit(eventName, payload)</div>
      </div>

      <Handle type="source" position={Position.Right} id="output" style={{ top: '50%', transform:'translateY(-50%)', width: 10, height: 10 }} />
    </div>
  );
};

export default React.memo(EventFlowNode);
