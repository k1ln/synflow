import React, { useState, useMemo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export interface NodePaletteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nodeTypes: Record<string, React.FC<any>>;
  onSelect: (type: string) => void;
}

// Derive a simple display name by splitting camel-case and trimming suffixes
function humanize(type: string){
  // Special case for FlowNode which is just "FlowNode" without prefix
  if (type === 'FlowNode') return 'Flow';
  return type.replace(/FlowNode$/,'').replace(/Node$/,'').replace(/([A-Z])/g,' $1').trim();
}

const dialogStyle: React.CSSProperties = {
  background:'#1d1d1f',
  color:'#eee',
  borderRadius:12,
  padding:'20px 22px 26px',
  position:'fixed',
  top:'50%',
  left:'50%',
  transform:'translate(-50%, -50%)',
  width:'min(900px, 90vw)',
  maxHeight:'80vh',
  display:'flex',
  flexDirection:'column',
  boxShadow:'0 8px 32px -4px rgba(0,0,0,0.6)',
  border:'1px solid #333'
};

const NodePaletteDialog: React.FC<NodePaletteDialogProps> = ({ open, onOpenChange, nodeTypes, onSelect }) => {
  const [query, setQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => Object.keys(nodeTypes).map(k => ({ key:k, name:humanize(k) })), [nodeTypes]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter(r => r.key.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .sort((a,b)=> sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [rows, query, sortAsc]);

  const handleSelect = useCallback((type:string)=>{
    onSelect(type);
    onOpenChange(false);
  }, [onSelect, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)', zIndex:1000 }} />
        <Dialog.Content style={{ ...dialogStyle, zIndex:1001 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <Dialog.Title style={{ fontSize:18, fontWeight:600 }}>Add Node</Dialog.Title>
            <button onClick={()=> onOpenChange(false)} style={{ background:'transparent', color:'#aaa', border:'none', fontSize:18, cursor:'pointer' }} aria-label='Close'>×</button>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            <input
              autoFocus
              placeholder='Search nodes...'
              value={query}
              onChange={e=> setQuery(e.target.value)}
              style={{ flex:'1 1 240px', background:'#111', color:'#eee', border:'1px solid #333', padding:'6px 10px', borderRadius:6 }}
            />
            <button onClick={()=> setSortAsc(s=> !s)} style={{ padding:'6px 10px', background:'#222', color:'#ccc', border:'1px solid #333', borderRadius:6, cursor:'pointer' }}>
              Sort {sortAsc ? '▲' : '▼'}
            </button>
            <div style={{ fontSize:12, opacity:.6, alignSelf:'center' }}>{filtered.length} / {rows.length}</div>
          </div>
          <div style={{ overflow:'auto', flex:1, border:'1px solid #2a2a2d', borderRadius:8, padding:12, background:'#18181a' }}>
            {filtered.length === 0 && (
              <div style={{ padding:'14px', textAlign:'center', opacity:.6 }}>No matches</div>
            )}
            <div
              style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',
                gap:10,
                alignContent:'start'
              }}
            >
              {filtered.map(r => (
                <button
                  key={r.key}
                  onClick={()=> handleSelect(r.key)}
                  onKeyDown={e=> { if(e.key==='Enter') { e.preventDefault(); handleSelect(r.key);} }}
                  style={{
                    position:'relative',
                    display:'flex',
                    flexDirection:'column',
                    justifyContent:'center',
                    alignItems:'center',
                    textAlign:'center',
                    gap:4,
                    padding:'4px 4px 5px',
                    minHeight:40,
                    background:'linear-gradient(135deg,#242428,#1b1b1e)',
                    border:'1px solid #2e2e32',
                    borderRadius:10,
                    cursor:'pointer',
                    fontSize:12,
                    color:'#e6e6e6',
                    boxShadow:'0 2px 4px rgba(0,0,0,0.4)',
                    transition:'background .15s,border-color .15s,transform .15s'
                  }}
                  onMouseEnter={e=> { e.currentTarget.style.background='#303035'; e.currentTarget.style.borderColor='#3d3d42'; }}
                  onMouseLeave={e=> { e.currentTarget.style.background='linear-gradient(135deg,#242428,#1b1b1e)'; e.currentTarget.style.borderColor='#2e2e32'; }}
                >
                  <div style={{ fontWeight:600, lineHeight:1.15, fontSize:14, overflowWrap:'anywhere', wordBreak:'break-word', whiteSpace:'normal' }}>{r.name}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop:14, display:'flex', justifyContent:'space-between', fontSize:11, opacity:.6 }}>
            <div>Enter / Click to add. Esc to close.</div>
            <div>{'Total: ' + rows.length}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default NodePaletteDialog;