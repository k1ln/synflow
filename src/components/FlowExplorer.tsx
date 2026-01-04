import React, { useEffect, useState } from 'react';
import { listMyFlows, listPublicFlows, saveFlow } from '../services/apiClient';

interface FlowMeta { id:string; name:string; is_public?:number; updated_at?:string; owner?:string; }

const FlowExplorer: React.FC<{ onOpen:(id:string)=>void; onCreate:(id:string)=>void; }> = ({ onOpen, onCreate }) => {
  const [my, setMy] = useState<FlowMeta[]>([]);
  const [pub, setPub] = useState<FlowMeta[]>([]);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('New Flow');

  useEffect(()=>{ refresh(); },[]);
  async function refresh(){
    try { setMy(await listMyFlows()); } catch {}
    try { setPub(await listPublicFlows()); } catch {}
  }

  async function createFlow(){
    const res = await saveFlow({ name: newName, data: { nodes:[], edges:[] }, is_public:false });
    setCreating(false); setNewName('New Flow'); refresh(); onCreate(res.id);
  }

  function renderGroup(title:string, items:FlowMeta[], icon:string){
    const entries = items.filter(f=> f.name.toLowerCase().includes(filter.toLowerCase()));
    if(!entries.length) return null;
    return <div style={{ marginBottom:12 }}>
      <div style={{ fontWeight:600, fontSize:12, opacity:0.7 }}>{title}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:8, marginTop:6 }}>
        {entries.map(f=> <div key={f.id} onClick={()=> onOpen(f.id)} style={{ cursor:'pointer', border:'1px solid #444', borderRadius:6, padding:8, background:'#222', display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ fontSize:11, opacity:0.6 }}>{icon}</div>
          <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.name}</div>
          {f.owner && <div style={{ fontSize:10, opacity:0.5 }}>{f.owner}</div>}
        </div>)}
      </div>
    </div>;
  }

  return <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
    <div style={{ display:'flex', gap:8, marginBottom:8 }}>
      <input placeholder='Search flows' value={filter} onChange={e=> setFilter(e.target.value)} style={{ flex:1 }} />
      <button onClick={()=> setCreating(c=> !c)}>{creating ? 'Cancel':'New'}</button>
    </div>
    {creating && <div style={{ display:'flex', gap:6, marginBottom:10 }}>
      <input value={newName} onChange={e=> setNewName(e.target.value)} />
      <button onClick={createFlow}>Create</button>
    </div>}
    <div style={{ overflow:'auto', flex:1 }}>
      {renderGroup('My Flows', my, '📁')}
      {renderGroup('Public Flows', pub, '🌐')}
    </div>
  </div>;
};

export default FlowExplorer;
