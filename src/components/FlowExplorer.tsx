import React, { useEffect, useState } from 'react';
import { SimpleIndexedDB } from '../util/SimpleIndexedDB';
import {
  loadRootHandle,
  saveFlowToDisk,
  listFlowsOnDisk,
  hasFsApi,
} from '../util/FileSystemAudioStore';

interface FlowMeta {
  id: string;
  name: string;
  is_public?: number;
  updated_at?: string;
  owner?: string;
}

const db = new SimpleIndexedDB('FlowSynthDB', 'flows');

const FlowExplorer: React.FC<{
  onOpen: (id: string) => void;
  onCreate: (id: string) => void;
}> = ({ onOpen, onCreate }) => {
  const [my, setMy] = useState<FlowMeta[]>([]);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('New Flow');

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    try {
      // Try loading from disk first if FS API is available
      if (hasFsApi()) {
        const rootHandle = await loadRootHandle();
        if (rootHandle) {
          const diskFlows = await listFlowsOnDisk(rootHandle);
          const meta: FlowMeta[] = diskFlows.map((flow) => ({
            id: flow.name,
            name: flow.name,
            updated_at: flow.updated_at,
          }));
          setMy(meta);
          return;
        }
      }
      // Fallback to IndexedDB
      await db.open();
      const flows = await db.get('*');
      const meta: FlowMeta[] = flows.map((flow: any) => ({
        id: flow.id,
        name: flow.id,
        updated_at: flow.updated_at,
      }));
      setMy(meta);
    } catch (e) {
      console.error('Error loading local flows:', e);
    }
  }

  async function createFlow() {
    const flowData = {
      name: newName,
      nodes: [],
      edges: [],
      updated_at: new Date().toISOString(),
    };

    // Try saving to disk first if FS API is available
    if (hasFsApi()) {
      const rootHandle = await loadRootHandle();
      if (rootHandle) {
        await saveFlowToDisk(rootHandle, flowData);
      }
    }

    // Always save to IndexedDB as well
    await db.open();
    await db.put(newName, {
      name: newName,
      data: { nodes: [], edges: [] },
      updated_at: flowData.updated_at,
    });

    setCreating(false);
    setNewName('New Flow');
    refresh();
    onCreate(newName);
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
    </div>
  </div>;
};

export default FlowExplorer;
