import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import "./AudioNode.css";
import EventBus from "../sys/EventBus";
import { loadRootHandle, verifyPermission, saveWorkletScriptToDisk, listWorkletScriptsFromDisk, deleteWorkletScriptFromDisk } from '../util/FileSystemAudioStore';

export type AudioWorkletFlowNodeProps = {
  data: {
    id?: string; // node id injected by react-flow wrapper
    label: string;
    processorCode?: string; // JavaScript code for the AudioWorkletProcessor
    style: React.CSSProperties;
  };
};

const AudioWorkletFlowNode: React.FC<AudioWorkletFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label);
  const defaultTemplate = `/** Dynamic AudioWorklet Processor Template
 * If an upstream audio input is connected, passes it through with simple gain.
 * If no input is present, emits a quiet test sine so you can verify routing.
 * The processor listens for postMessage commands as a starting point.
 */
class ExtendAudioWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'a-rate' },
      { name: 'tone', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor(){
    super();
    this._phase = 0;
    this._gainOverride = null;
    this.port.onmessage = (event) => {
      const data = event ? event.data : null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'setGain') {
        const next = Number(data.value);
        if (Number.isFinite(next)) this._gainOverride = next;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;

    const gainValues = parameters && parameters.gain;
    const toneValues = parameters && parameters.tone;
    const gain = this._gainOverride ?? (gainValues && gainValues.length ? gainValues[0] : 1);
    const toneEnabled = toneValues && toneValues.length ? toneValues[0] >= 0.5 : false;

    if (input && input.length) {
      for (let ch = 0; ch < output.length; ch++) {
        const source = input[ch] || input[0];
        const target = output[ch];
        if (!source || !target) continue;
        for (let i = 0; i < target.length; i++) {
          target[i] = source[i] * gain;
        }
      }
    } else if (toneEnabled) {
      const freq = 220;
      const inc = 2 * Math.PI * freq / sampleRate;
      for (let ch = 0; ch < output.length; ch++) {
        const buf = output[ch];
        if (!buf) continue;
        for (let i = 0; i < buf.length; i++) {
          buf[i] = 0.1 * Math.sin(this._phase) * gain;
          this._phase += inc;
          if (this._phase > Math.PI * 2) this._phase -= Math.PI * 2;
        }
      }
    } else {
      for (let ch = 0; ch < output.length; ch++) {
        const buf = output[ch];
        if (!buf) continue;
        for (let i = 0; i < buf.length; i++) {
          buf[i] = 0;
        }
      }
    }

    return true; // keep processor alive
  }
}
// The host will append registerProcessor('...') automatically if missing
`; 
  // Script code & scripts list
  const [processorCode, setProcessorCode] = useState<string>(data.processorCode || defaultTemplate);
  const [isExpanded, setIsExpanded] = useState<boolean>((data as any).expanded ?? false);
  const [isHidden, setIsHidden] = useState<boolean>((data as any).hidden ?? false);
  const [scriptName, setScriptName] = useState<string>((data as any).scriptName || 'unnamed');
  type ScriptEntry = { name: string; code: string; remoteId?: string; hasLocal: boolean; hasDisk: boolean };
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [filter, setFilter] = useState('');
  const nodeId = (data.id || (data as any)._reactFlowNodeId || '') as string;
  // Parameter definitions (control params) persisted on node
  type ParamMode = 'flow' | 'stream';
  type Param = { id: string; name: string; value: number; mode?: ParamMode };
  const resolveMode = (param: Param | undefined): ParamMode => {
    if (!param) return 'stream';
    return param.mode === 'flow' ? 'flow' : 'stream';
  };
  const initialParams: Param[] = useMemo(() => {
    const arr = (data as any).params as Param[] | undefined;
    if (Array.isArray(arr) && arr.length) {
      return arr.map(p => ({ ...p, mode: resolveMode(p) }));
    }
    return [];
  }, [data]);
  const [params, setParams] = useState<Param[]>(initialParams);
  // Replace modal with inline collapsible editor region
  const [showEditor, setShowEditor] = useState<boolean>((data as any).showEditor ?? false);
  const [listCollapsed, setListCollapsed] = useState<boolean>((data as any).listCollapsed ?? false);
  const filteredScripts = useMemo(()=> scripts.filter(s=> s.name.toLowerCase().includes(filter.toLowerCase())),[scripts,filter]);
  const eventBus = EventBus.getInstance();

  // Persist initial default back to node data to keep saves consistent
  useEffect(()=>{
    if(!data.processorCode){
      data.processorCode = processorCode;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    (data as any).expanded = isExpanded;
    (data as any).hidden = isHidden;
  }, [data, isExpanded, isHidden]);

  useEffect(() => {
    if (showEditor) {
      if (isHidden) {
        setIsHidden(false);
        (data as any).hidden = false;
      }
      if (!isExpanded) {
        setIsExpanded(true);
        (data as any).expanded = true;
      }
    }
    (data as any).showEditor = showEditor;
  }, [showEditor, isHidden, isExpanded, data]);

  useEffect(() => {
    (data as any).listCollapsed = listCollapsed;
  }, [listCollapsed, data]);

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    (data as any).expanded = next;
    if(next){
      setIsHidden(false);
      (data as any).hidden = false;
    } else if (showEditor) {
      setShowEditor(false);
    }
  };

  const toggleHidden = () => {
    const next = !isHidden;
    setIsHidden(next);
    (data as any).hidden = next;
    if (next && showEditor) {
      setShowEditor(false);
    }
  };

  const loadScripts = useCallback(async (): Promise<ScriptEntry[]> => {
    const normalized = new Map<string, ScriptEntry>();
    const ensureEntry = (rawName: string): ScriptEntry => {
      const key = rawName.toLowerCase();
      const existing = normalized.get(key);
      if (existing) {
        existing.name = rawName;
        return existing;
      }
      const created: ScriptEntry = { name: rawName, code: '', remoteId: undefined, hasLocal: false, hasDisk: false };
      normalized.set(key, created);
      return created;
    };

    // Remote scripts (lowest priority)
    try {
      const resp = await fetch('/api/scripts');
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list)) {
          list.forEach((it: any) => {
            if (!it) return;
            const rawName = typeof it.name === 'string' ? it.name.trim() : '';
            if (!rawName) return;
            const entry = ensureEntry(rawName);
            if (!entry.code) entry.code = typeof it.code === 'string' ? it.code : entry.code;
            if (it.id && typeof it.id === 'string') entry.remoteId = it.id;
          });
        }
      }
    } catch { /* ignore remote errors */ }

    // LocalStorage scripts (override remote)
    try {
      const raw = localStorage.getItem('workletScripts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) parsed.forEach((item) => {
          if (!item) return;
          const rawName = typeof item.name === 'string' ? item.name.trim() : '';
          if (!rawName) return;
          const entry = ensureEntry(rawName);
          entry.code = typeof item.code === 'string' ? item.code : '';
          entry.hasLocal = true;
        });
      }
    } catch { /* ignore parse errors */ }

    // Disk scripts (highest priority)
    try {
      const root = await loadRootHandle();
      if (root && await verifyPermission(root, 'read')) {
        const diskScripts = await listWorkletScriptsFromDisk(root);
        diskScripts.forEach((item) => {
          if (!item) return;
          const rawName = typeof item.name === 'string' ? item.name.trim() : '';
          if (!rawName) return;
          const entry = ensureEntry(rawName);
          entry.code = typeof item.code === 'string' ? item.code : entry.code;
          entry.hasDisk = true;
        });
      }
    } catch (e) {
      console.warn('[AudioWorkletFlowNode] disk script load failed', e);
    }

    const combined = Array.from(normalized.values()).sort((a, b) => a.name.localeCompare(b.name));
    setScripts(combined);
    return combined;
  }, []);

  useEffect(() => {
    (async () => {
      const loaded = await loadScripts();
      // Priority 1: existing node data (saved with flow) wins
      if (data.processorCode) {
        setProcessorCode(data.processorCode);
        if ((data as any).scriptName) setScriptName((data as any).scriptName);
        return;
      }
      // Priority 2: previously selected script for this node
      if (nodeId) {
        const savedName = localStorage.getItem(`workletScriptSelection:${nodeId}`);
        if (savedName && loaded.some(s => s.name === savedName)) {
          const found = loaded.find(s => s.name === savedName)!;
          setScriptName(found.name);
          setProcessorCode(found.code);
          (data as any).scriptName = found.name;
          data.processorCode = found.code;
          return;
        }
      }
      // Priority 3: first available script
      if (loaded.length) {
        setScriptName(loaded[0].name);
        setProcessorCode(loaded[0].code);
        (data as any).scriptName = loaded[0].name;
        data.processorCode = loaded[0].code;
        return;
      }
      // Priority 4: fallback template already in state
    })();
  }, [loadScripts, data, nodeId]);

  const saveLocalScripts = useCallback((next: ScriptEntry[]) => {
    const toPersist = next.filter(item => item.hasLocal).map(item => ({ name: item.name, code: item.code }));
    if (toPersist.length) {
      localStorage.setItem('workletScripts', JSON.stringify(toPersist));
    } else {
      localStorage.removeItem('workletScripts');
    }
  }, []);

  const saveProcessorCode = async () => {
    let finalName = scriptName.trim();
    if (!finalName) finalName = 'unnamed';
    setScriptName(finalName);
    const existingIdx = scripts.findIndex(s => s.name === finalName);
    let remoteId = existingIdx >= 0 ? scripts[existingIdx].remoteId : undefined;
    let hasDisk = existingIdx >= 0 ? scripts[existingIdx].hasDisk : false;
    try {
      const root = await loadRootHandle();
      if (root && await verifyPermission(root, 'readwrite')) {
        const result = await saveWorkletScriptToDisk(root, finalName, processorCode);
        if (result.ok) hasDisk = true;
      }
    } catch (e) {
      console.warn('[AudioWorkletFlowNode] save to disk failed', e);
    }
    const updatedEntry: ScriptEntry = {
      name: finalName,
      code: processorCode,
      remoteId,
      hasLocal: true,
      hasDisk
    };
    const nextScripts = existingIdx >= 0 ? scripts.map(s => s.name === finalName ? updatedEntry : s) : [...scripts, updatedEntry];
    setScripts(nextScripts);
    saveLocalScripts(nextScripts);
    data.processorCode = processorCode;
    (data as any).scriptName = finalName;
    const selNodeId = nodeId;
    if (selNodeId) {
      localStorage.setItem(`workletScriptSelection:${selNodeId}`, finalName);
    }
    const emitNodeId = selNodeId || finalName;
    eventBus.emit(emitNodeId + '.processor.save', { code: processorCode });
    const combined = await loadScripts();
    const refreshed = combined.find(s => s.name === finalName);
    if (refreshed) {
      setScriptName(refreshed.name);
      setProcessorCode(refreshed.code);
      data.processorCode = refreshed.code;
      (data as any).scriptName = refreshed.name;
    }
  };

  const deleteScriptEntry = useCallback(async (entry: ScriptEntry) => {
    if (!entry) return;
    const confirmed = typeof window !== 'undefined' ? window.confirm?.(`Delete script "${entry.name}"?`) : true;
    if (confirmed === false) return;
    // Remove from local state immediately
    const remaining = scripts.filter(s => s.name !== entry.name);
    setScripts(remaining);
    saveLocalScripts(remaining);

    if (nodeId) {
      const selectionKey = `workletScriptSelection:${nodeId}`;
      const selectedName = localStorage.getItem(selectionKey);
      if (selectedName === entry.name) localStorage.removeItem(selectionKey);
    }

    try {
      const root = await loadRootHandle();
      if (root && await verifyPermission(root, 'readwrite')) {
        await deleteWorkletScriptFromDisk(root, entry.name);
      }
    } catch (e) {
      console.warn('[AudioWorkletFlowNode] disk script delete failed', e);
    }

    const combined = await loadScripts();
    if (scriptName === entry.name) {
      if (combined.length) {
        const fallback = combined[0];
        setScriptName(fallback.name);
        setProcessorCode(fallback.code);
        data.processorCode = fallback.code;
        (data as any).scriptName = fallback.name;
        if (nodeId) localStorage.setItem(`workletScriptSelection:${nodeId}`, fallback.name);
      } else {
        setScriptName('unnamed');
        setProcessorCode(defaultTemplate);
        data.processorCode = defaultTemplate;
        delete (data as any).scriptName;
      }
    }
  }, [scripts, saveLocalScripts, data, scriptName, defaultTemplate, loadScripts]);

  const createNewScript = () => {
    // Generate unique base name
    const base = 'script';
    let i = 1;
    while (scripts.some(s => s.name === `${base}${i}`)) i++;
    const newName = `${base}${i}`;
    setScriptName(newName);
    setProcessorCode(defaultTemplate);
    (data as any).scriptName = newName;
    data.processorCode = defaultTemplate;
  };

  const loadScript = (name:string) => {
    const found = scripts.find(s=> s.name === name);
    if(!found) return;
    setScriptName(found.name);
    setProcessorCode(found.code);
    (data as any).scriptName = found.name;
    data.processorCode = found.code;
    const nodeId = data.id || (data as any)._reactFlowNodeId;
    if(nodeId){
      localStorage.setItem(`workletScriptSelection:${nodeId}`, found.name);
    }
  };

  // Node no longer expands the editor inline; keep width semantics for visual consistency
  const containerStyle: React.CSSProperties = {
    ...data.style,
    width: isHidden ? 200 : (isExpanded ? 760 : 240),
    minWidth: isHidden ? 200 : (isExpanded ? 760 : 240),
    transition: 'width 0.25s ease, height 0.25s ease',
    textAlign: 'left',
    overflow: 'visible', // allow handles to show outside
    position: 'relative'
  }

  if (data.style === undefined) {
    data.style = {
      padding: "10px",
      border: "1px solid #ddd",
      borderRadius: "5px",
      width: "200px",
      textAlign: "center",
      background: "#333",
      color: "#eee",
    }
  }
  const openEditor = useCallback(() => {
    if (isHidden) return;
    if (!isExpanded) {
      setIsExpanded(true);
      (data as any).expanded = true;
    }
    setShowEditor(true);
  }, [isHidden, isExpanded, data]);
  const closeEditor = useCallback(()=> setShowEditor(false), []);

  // Close modal on ESC
  useEffect(()=>{
    if(!showEditor) return;
    const onKey = (e:KeyboardEvent)=>{ if(e.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[showEditor, closeEditor]);

  // Prevent dragging while inside the code editor region
  const stopDrag: React.MouseEventHandler = (e) => { e.stopPropagation(); };
  const editorEventBlockers = showEditor ? {
    onMouseDown: stopDrag,
    onPointerDown: stopDrag,
    onDragStart: stopDrag
  } : {};

  // Sync outward when params change
  useEffect(() => {
    (data as any).params = params;
  }, [params, data]);

  // Handle external param updates (other nodes driving this node)
  useEffect(() => {
    if (!nodeId) return;
    const handler = (payload: any) => {
      if (!payload || payload.nodeid !== nodeId) return;
      if (payload.data && Array.isArray(payload.data.params)) {
        setParams(payload.data.params.map((p: any) => ({ id: String(p.id), name: String(p.name), value: Number(p.value) })));
      }
    };
    eventBus.subscribe(nodeId + '.params.updateParams', handler);
    eventBus.subscribe('params.updateParams', handler);
    return () => {
      eventBus.unsubscribe(nodeId + '.params.updateParams', handler);
      eventBus.unsubscribe('params.updateParams', handler);
    };
  }, [nodeId, eventBus]);

  const emitParamChange = (next: Param[], descriptorChanged = false) => {
    const nodeId = data.id || (data as any)._reactFlowNodeId;
    (data as any).params = next;
    eventBus.emit(nodeId + '.params.updateParams', { nodeid: nodeId, data: { params: next } });
    eventBus.emit('params.updateParams', { nodeid: nodeId, data: { params: next } });
    if (descriptorChanged) {
      eventBus.emit(nodeId + '.processor.paramsChanged', { nodeid: nodeId, params: next });
    }
  };

  const addParam = () => {
    let idx = 1;
    while (params.some(p => p.name === 'param' + idx)) idx++;
    const newParam: Param = {
      id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random()),
      name: 'param' + idx,
      value: 0,
      mode: 'flow'
    };
    const next = [...params, newParam];
    setParams(next);
    emitParamChange(next, true);
  };

  const updateParam = (id: string, patch: Partial<Param>) => {
    const next = params.map(p => p.id === id ? { ...p, ...patch } : p);
    const descriptorChanged = ['name', 'mode'].some(key => Object.prototype.hasOwnProperty.call(patch, key));
    setParams(next);
    emitParamChange(next, descriptorChanged);
  };

  const deleteParam = (id: string) => {
    const next = params.filter(p => p.id !== id);
    setParams(next);
    emitParamChange(next, true);
  };

  useEffect(() => {
    emitParamChange(params, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={containerStyle}>
      {/* Main Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="main-input"
        style={{ top: 18, width: 10, height: 10, background: '#444', border: '1px solid #888' }}
      />
      {/* Dynamic parameter target handles */}
      {params.map((p, i) => (
        <Handle
          key={p.id}
          type="target"
          position={Position.Left}
              id={`${resolveMode(p) === 'stream' ? 'param-stream-' : 'param-flow-'}${p.id}`}
          style={{ top: 42 + i * 16, width: 8, height: 8, background: '#555', border: '1px solid #888' }}
        />
      ))}
      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: 18, width: 10, height: 10, background: '#444', border: '1px solid #888' }}
      />
      <div className="audio-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <label><b>Audio Worklet:</b></label>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={toggleHidden} style={{padding:'2px 8px', background:'#1e1e1e', color:'#eee', border:'1px solid #444', borderRadius:4}}>{isHidden ? 'Show' : 'Hide'}</button>
          <button onClick={toggleExpanded} style={{padding:'2px 8px', background:'#1e1e1e', color:'#eee', border:'1px solid #444', borderRadius:4}} disabled={isHidden}>{isExpanded ? 'Shrink' : 'Expand'}</button>
        </div>
      </div>
      {/* Minimal inline controls */}
      {!isHidden && (
        <div style={{marginTop:6, display:'flex', justifyContent:'space-between', alignItems:'center', gap:6}}>
          <div style={{display:'flex', gap:6}}>
            <button onClick={openEditor} disabled={showEditor} style={{ padding:'4px 10px', background: showEditor? '#333':'#0054aa', color:'#fff', border:'1px solid #224', borderRadius:4, fontSize:'0.7rem', opacity: showEditor?0.6:1 }}>Edit Script…</button>
          </div>
          <span style={{fontSize:'0.6rem', opacity:0.7, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={scriptName}>{scriptName}</span>
        </div>
      )}
      {/* Parameter list (collapsed when hidden) */}
      {!isHidden && params.length > 0 && (
        <div
          style={{marginTop:6, display:'flex', flexDirection:'column', gap:4}}
          {...editorEventBlockers}
        >
          {params.map(p => (
            <div key={p.id} style={{display:'flex', alignItems:'center', gap:4}}>
              <input
                style={{flex:1, minWidth:40, fontSize:'0.55rem', background:'#262a2f', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'2px 4px'}}
                value={p.name}
                onChange={e=> updateParam(p.id, { name: e.target.value })}
                title="Parameter name (used for reference)"
              />
              <select
                value={resolveMode(p)}
                onChange={e => updateParam(p.id, { mode: e.target.value as ParamMode })}
                style={{width:64, fontSize:'0.55rem', background:'#262a2f', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'2px 2px'}}
                title="Parameter mode"
              >
                <option value="flow">flow</option>
                <option value="stream">stream</option>
              </select>
              <input
                type="number"
                style={{width:54, fontSize:'0.55rem', background:'#262a2f', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'2px 4px'}}
                value={p.value}
                onChange={e=> updateParam(p.id, { value: Number(e.target.value) })}
                title="Parameter value"
              />
              <button onClick={()=> deleteParam(p.id)} style={{width:20, height:20, fontSize:'0.6rem', background:'#3a1d1d', color:'#ffaaaa', border:'1px solid #633', borderRadius:4}} title="Delete parameter">×</button>
            </div>
          ))}
        </div>
      )}
      {!isHidden && (
        <div style={{marginTop:4, display:'flex', gap:6}} {...editorEventBlockers}>
          <button onClick={addParam} style={{padding:'2px 6px', background:'#1d3d25', color:'#aef7c2', border:'1px solid #2f5a3a', borderRadius:4, fontSize:'0.55rem'}}>Add Param</button>
        </div>
      )}
      {showEditor && !isHidden && (
        <div {...editorEventBlockers} style={{marginTop:8, background:'#1d1f22', border:'1px solid #444', borderRadius:6, padding:10, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <strong style={{fontSize:'0.75rem'}}>Script Editor</strong>
            <div style={{display:'flex', gap:8}}>
              <button onClick={createNewScript} style={{padding:'4px 10px', background:'#374151', color:'#fff', border:'1px solid #465264', borderRadius:4, fontSize:'0.65rem'}}>New</button>
              <button onClick={saveProcessorCode} style={{padding:'4px 10px', background:'#2563eb', color:'#fff', border:'1px solid #1e4fb3', borderRadius:4, fontSize:'0.65rem'}}>Save</button>
              <button onClick={closeEditor} style={{padding:'4px 10px', background:'#2f3338', color:'#ddd', border:'1px solid #444', borderRadius:4, fontSize:'0.65rem'}}>Close</button>
            </div>
          </div>
          <div style={{display:'flex', gap:10}}>
            {/* Script list */}
            <div style={{width: listCollapsed ? 32 : 180, display:'flex', flexDirection:'column', transition:'width 0.25s ease'}}>
              <div style={{display:'flex', alignItems:'center', gap:4, marginBottom:4}}>
                <button onClick={()=> setListCollapsed(c=> !c)} title={listCollapsed? 'Expand script list':'Collapse script list'} style={{width:24, height:24, background:'#272b30', color:'#ddd', border:'1px solid #444', borderRadius:4, fontSize:'0.65rem', cursor:'pointer'}}>{listCollapsed? '▶':'◀'}</button>
                {!listCollapsed && (
                  <input placeholder='filter' value={filter} onChange={e=> setFilter(e.target.value)} style={{ flex:1, fontSize:'0.6rem', background:'#272b30', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'4px 6px' }} />
                )}
              </div>
              {!listCollapsed && (
                <div style={{flex:1, maxHeight:180, overflowY:'auto', border:'1px solid #444', borderRadius:4, padding:4, background:'#202327'}}>
                  {filteredScripts.length === 0 && <div style={{fontSize:'0.6rem', opacity:0.7}}>No scripts</div>}
                  {filteredScripts.map(s=> (
                    <div key={s.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.55rem', cursor:'pointer', padding:'3px 4px', borderBottom:'1px solid #2a2d31', background: s.name===scriptName? '#2d3742':'transparent', borderRadius:3 }} onClick={()=> loadScript(s.name)}>
                      <div style={{display:'flex', flexDirection:'column', flex:1, minWidth:0}}>
                        <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</span>
                        <span style={{fontSize:'0.48rem', opacity:0.6}}>
                          {s.remoteId ? 'remote ' : ''}
                          {s.hasLocal ? 'local ' : ''}
                          {s.hasDisk ? 'disk' : ''}
                        </span>
                      </div>
                      <div style={{display:'flex', gap:4}}>
                        <button style={{padding:'0 4px', background:'#222', color:'#ddd', border:'1px solid #444', borderRadius:3}} onClick={(e)=>{e.stopPropagation(); loadScript(s.name);}}>Load</button>
                        <button style={{padding:'0 4px', background:'#401b1b', color:'#ffb4b4', border:'1px solid #633', borderRadius:3}} onClick={(e)=>{e.stopPropagation(); deleteScriptEntry(s);}}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!listCollapsed && (
                <div style={{marginTop:6}}>
                  <input value={scriptName} onChange={e=> setScriptName(e.target.value)} placeholder='script name' style={{ width:'100%', fontSize:'0.55rem', background:'#272b30', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'4px 6px' }} />
                </div>
              )}
            </div>
            {/* Editor */}
            <div style={{flex:1, minWidth:0}}>
              <CodeMirror
                value={processorCode}
                height={'340px'}
                extensions={[javascript()]}
                theme="dark"
                onChange={(value) => { setProcessorCode(value); data.processorCode = value; }}
                className="audio-codemirror nodrag"
              />
              <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
                <span style={{fontSize:'0.5rem', opacity:0.6}}>ESC closes • Persisted per node</span>
                <div style={{display:'flex', gap:6}}>
                  <button onClick={saveProcessorCode} style={{padding:'4px 10px', background:'#2563eb', color:'#fff', border:'1px solid #1e4fb3', borderRadius:4, fontSize:'0.55rem'}}>Save</button>
                  <button onClick={closeEditor} style={{padding:'4px 10px', background:'#2f3338', color:'#ddd', border:'1px solid #444', borderRadius:4, fontSize:'0.55rem'}}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AudioWorkletFlowNode);