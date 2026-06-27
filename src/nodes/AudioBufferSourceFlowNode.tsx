import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export type AudioBufferSegment = {
  id: string;
  label: string;
  start: number; // seconds
  end: number;   // seconds
};

export type SampleFlowNodeProps = {
  data: {
    id: string;
    label: string;
    style?: React.CSSProperties;
    fileName?: string;
    fileId?: string; // persisted backend id
    fileUrl?: string; // served URL
    arrayBuffer?: ArrayBuffer | null; // raw file data persisted
    duration?: number; // decoded duration (for UI only)
    segments: AudioBufferSegment[];
    autoStop?: boolean; // if true, stop when segment ends (default true)
    onChange?: (data:any)=>void;
  }
};

const randomId = ()=> Math.random().toString(36).slice(2,10);

const SampleFlowNode: React.FC<SampleFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const updateNodeInternals = useUpdateNodeInternals();
  const [label, setLabel] = useState(data.label || 'Sample');
  const [fileName, setFileName] = useState<string | undefined>(data.fileName);
  const [fileId, setFileId] = useState<string | undefined>(data.fileId);
  const [fileUrl, setFileUrl] = useState<string | undefined>(data.fileUrl);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(data.arrayBuffer || null);
  const [duration, setDuration] = useState<number | undefined>(data.duration);
  const [segments, setSegments] = useState<AudioBufferSegment[]>(data.segments || []);
  const fileInputRef = useRef<HTMLInputElement|null>(null);
  const [style, setStyle] = useState<React.CSSProperties>(data.style || { background:'#333', color:'#eee', padding:10, width:260 });
  // Prefetch guard
  const prefetchingRef = useRef(false);
  
  // Dynamically size the segment list: allow the node to grow naturally for a
  // reasonable number of segments, then introduce a scroll area past a soft cap
  // so extremely large sample lists don't consume the entire canvas.
  const segmentListStyle = useMemo<React.CSSProperties>(()=>{
    const base: React.CSSProperties = { background:'#222', padding:4, borderRadius:4 };
    const SOFT_MAX_VISIBLE = 6; // number of segment cards before scrolling kicks in
    if(segments.length > SOFT_MAX_VISIBLE){
      // Approximate per-segment vertical footprint (card + margin)
      const per = 78; // tweak if visual layout changes
      base.maxHeight = SOFT_MAX_VISIBLE * per;
      base.overflowY = 'auto';
    }
    return base;
  }, [segments.length]);

  // Update external consumer
  useEffect(()=>{
    data.label = label;
    data.fileName = fileName;
    data.fileId = fileId;
    data.fileUrl = fileUrl;
    data.arrayBuffer = arrayBuffer || undefined;
    data.duration = duration;
    data.segments = segments;
    if(data.onChange) data.onChange({ ...data });
    // notify params change so virtual node can react (e.g., re-decode file)
    eventBus.emit(data.id + '.params.updateParams', { nodeid: data.id, data:{ label, fileName, fileId, fileUrl, duration, segments } });
  }, [label, fileName, fileId, fileUrl, arrayBuffer, duration, segments]);

  useEffect(()=>{
    eventBus.subscribe(data.id + '.style.background', (d:any)=>{ if(d?.color) setStyle(s=>({ ...s, background:d.color })); });
    return ()=>{ eventBus.unsubscribeAll(data.id + '.style.background'); };
  }, []);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    setFileName(file.name);
    // backend upload
    try {
      const svc = (await import('../services/../services/AudioFileService')).default; // dynamic to avoid bundler issues if service not yet loaded
      const meta = await svc.uploadFile(file);
      setFileId(meta.id);
      setFileUrl(meta.url);
      // also fetch binary for immediate decoding client side
      const resp = await fetch(meta.url);
      const buf = await resp.arrayBuffer();
      setArrayBuffer(buf);
      eventBus.emit(data.id + '.params.updateParams', { nodeid: data.id, data:{ arrayBuffer: buf, fileName: file.name, fileId: meta.id, fileUrl: meta.url }});
    } catch(err){
      console.warn('Upload failed, falling back to local only', err);
      const buf = await file.arrayBuffer();
      setArrayBuffer(buf);
      eventBus.emit(data.id + '.params.updateParams', { nodeid: data.id, data:{ arrayBuffer: buf, fileName: file.name }});
    }
    setDuration(undefined);
  }, []);

  // Prefetch previously saved file (when node restored) if we have an id/url but no buffer yet.
  useEffect(()=>{
    if(arrayBuffer) return; // already loaded
    if(prefetchingRef.current) return; // avoid parallel
    if(!fileId && !fileUrl) return; // nothing to fetch
    let cancelled = false;
    (async () => {
      try {
        prefetchingRef.current = true;
        let url = fileUrl;
        if(!url && fileId){
          try {
            const svc = (await import('../services/AudioFileService')).default;
            const meta = await svc.getMeta(fileId);
            if(cancelled) return;
            setFileUrl(meta.url);
            url = meta.url;
          } catch(err){
            console.warn('Prefetch meta failed', err);
          }
        }
        if(!url) return; // still nothing
        try {
          const resp = await fetch(url);
          if(!resp.ok) throw new Error('Fetch failed ' + resp.status);
          const buf = await resp.arrayBuffer();
          if(cancelled) return;
          setArrayBuffer(buf);
          eventBus.emit(data.id + '.params.updateParams', { nodeid: data.id, data:{ arrayBuffer: buf, fileUrl: url }});
        } catch(err){
          console.warn('Prefetch audio fetch failed', err);
        }
      } finally {
        prefetchingRef.current = false;
      }
    })();
    return ()=>{ cancelled = true; };
  }, [fileId, fileUrl, arrayBuffer, data.id, eventBus]);

  const addSegment = ()=>{
    const start = 0;
    const end = Math.max(0.5, duration || 1);
    const seg: AudioBufferSegment = { id: randomId(), label: 'Part ' + (segments.length+1), start, end };
    setSegments(prev=>[...prev, seg]);
  };

  const updateSegment = (id:string, patch: Partial<AudioBufferSegment>)=>{
    setSegments(prev=> prev.map(s=> s.id===id ? { ...s, ...patch, end: Math.max((patch.start ?? s.start)+0.01, patch.end ?? s.end) } : s));
  };

  const removeSegment = (id:string)=>{ setSegments(prev=> prev.filter(s=> s.id!==id)); };

  const playSegment = (segment: AudioBufferSegment)=>{
    // Simple trigger: emit receiveNodeOn for that segment-specific handle; virtual node listens
    eventBus.emit(data.id + '.' + segment.id + '.receiveNodeOn', { segment });
  };

  if(!data.style){ data.style = style; }

  // Ensure React Flow is aware of newly added / removed dynamic handles.
  useEffect(()=>{
    // Only when count changes (add/remove) we need a recalculation.
    updateNodeInternals(data.id);
  }, [segments.length, data.id, updateNodeInternals]);

  return (
    <div style={style}>
      <div className='audio-header'>
        <label><b>SAMPLE:</b></label>
        <input className='audio-label-input' value={label} onChange={e=> setLabel(e.target.value)} />
      </div>

      <div style={{ marginBottom:6 }}>
  <input type='file' accept='.wav,.mp3,.ogg,.flac' ref={fileInputRef} onChange={onFileSelected} style={{ background:'#111', color:'#eee', border:'1px solid #555', padding:4, width:'100%' }} />
        {fileName && <div style={{ fontSize:12, opacity:0.8 }}>{fileName}{duration ? ` (${duration.toFixed(2)}s)` : ''}{fileId ? ' • saved' : ''}</div>}
      </div>

      <div style={segmentListStyle}>
        {segments.map((seg, idx)=> (
          <div key={seg.id} style={{ border:'1px solid #555', borderRadius:4, padding:4, marginBottom:4, background:'#2f2f2f', position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <input style={{ flex:1, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px' }} value={seg.label} onChange={e=> updateSegment(seg.id,{ label:e.target.value })} />
              <button onClick={()=> playSegment(seg)} style={{ background:'#444', color:'#eee' }}>▶</button>
              <button onClick={()=> removeSegment(seg.id)} style={{ background:'#522', color:'#eee' }}>✕</button>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:4 }}>
              <label style={{ fontSize:11 }}>Start
                <input
                  type='text'
                  value={seg.start}
                  onChange={e=> {
                    const v = parseFloat(e.target.value.replace(/,/g,'.'));
                    if(!isNaN(v)) updateSegment(seg.id,{ start: Math.max(0, v) });
                  }}
                  onKeyDown={e=>{
                    const adjust = (delta:number)=>{
                      const next = Math.max(0, parseFloat((seg.start + delta).toFixed(4)));
                      updateSegment(seg.id,{ start: next });
                    };
                    if(e.key==='ArrowUp'){ adjust(0.01); e.preventDefault(); }
                    else if(e.key==='ArrowDown'){ adjust(-0.01); e.preventDefault(); }
                    else if(e.key==='ArrowRight' && e.ctrlKey){ adjust(10); e.preventDefault(); }
                    else if(e.key==='ArrowLeft' && e.ctrlKey){ adjust(-10); e.preventDefault(); }
                    else if(e.key==='ArrowRight'){ adjust(1); e.preventDefault(); }
                    else if(e.key==='ArrowLeft'){ adjust(-1); e.preventDefault(); }
                  }}
                  style={{ width:60, marginLeft:4, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                />
              </label>
              <label style={{ fontSize:11 }}>End
                <input
                  type='text'
                  value={seg.end}
                  onChange={e=> {
                    const v = parseFloat(e.target.value.replace(/,/g,'.'));
                    if(!isNaN(v)) updateSegment(seg.id,{ end: Math.max(0, v) });
                  }}
                  onKeyDown={e=>{
                    const adjust = (delta:number)=>{
                      const next = Math.max(0, parseFloat((seg.end + delta).toFixed(4)));
                      updateSegment(seg.id,{ end: next });
                    };
                    if(e.key==='ArrowUp'){ adjust(0.01); e.preventDefault(); }
                    else if(e.key==='ArrowDown'){ adjust(-0.01); e.preventDefault(); }
                    else if(e.key==='ArrowRight' && e.ctrlKey){ adjust(10); e.preventDefault(); }
                    else if(e.key==='ArrowLeft' && e.ctrlKey){ adjust(-10); e.preventDefault(); }
                    else if(e.key==='ArrowRight'){ adjust(1); e.preventDefault(); }
                    else if(e.key==='ArrowLeft'){ adjust(-1); e.preventDefault(); }
                  }}
                  style={{ width:60, marginLeft:4, background:'#111', color:'#eee', border:'1px solid #555', padding:'2px 4px', fontSize:12 }}
                />
              </label>
            </div>
            {/* Dynamic target handle for this segment (vertically centered within segment card) */}
            <Handle
              type='target'
              position={Position.Left}
              id={seg.id}
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>
        ))}
        {segments.length===0 && <div style={{ fontSize:12, opacity:0.7 }}>No segments yet. Add one.</div>}
      </div>
  <button onClick={addSegment} style={{ width:'100%', marginTop:4, background:'#222', color:'#eee', border:'1px solid #555', padding:'6px 8px', borderRadius:4 }}>Add Segment</button>

      {/* Main Output */}
      <Handle type='source' position={Position.Right} id='output' className='mainOutput' />
    </div>
  );
};

export default SampleFlowNode;
