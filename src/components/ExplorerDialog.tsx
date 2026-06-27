import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ExplorerFlowItem {
  id: string;
  name: string;
  updated_at?: string;
  owner?: string; // for public flows
  data?: any; // full flow graph
  folder_path?: string; // '' for root, 'a/b' for nested
  _source: 'local' | 'mine' | 'public';
  is_public?: boolean;
}

type SortMode = 'name' | 'updated';

interface ExplorerDialogProps {
  open: boolean;
  localFlows: ExplorerFlowItem[]; // include folder_path
  folders?: string[]; // explicit folder list (local)
  myFlows?: ExplorerFlowItem[];
  publicFlows?: ExplorerFlowItem[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenLocal: (name: string, folder_path?: string) => void;
  onOpenRemote?: (item: ExplorerFlowItem) => void;
  onClose: () => void;
  title?: string;
  backgroundColor?: string;
  headerBackgroundColor?: string;
  localLabel?: string;
  myLabel?: string;
  publicLabel?: string;
  onTogglePublish?: (item: ExplorerFlowItem, makePublic: boolean) => void;
  onDeleteLocal?: (name: string, folder_path?: string) => void;
  onDeleteRemote?: (item: ExplorerFlowItem) => void;
  onCreateFolder?: (parentPath: string | undefined) => void;
  onRenameFolder?: (oldPath: string, newPath: string) => void;
  onMoveFlow?: (flow: ExplorerFlowItem, targetFolder: string) => void;
  onRenameFlow?: (flow: ExplorerFlowItem, newName: string) => void;
  usePortal?: boolean;
  fullScreen?: boolean;
}

/*
  Dual-pane explorer dialog.
  Left: Local Flows
  Right: Remote (Mine + Public grouped by owner email)
*/
export const ExplorerDialog: React.FC<ExplorerDialogProps> = ({ open, localFlows, folders = [], myFlows = [], publicFlows = [], loading, onRefresh, onOpenLocal, onOpenRemote, onClose, title = 'Open Flow', backgroundColor = '#111', headerBackgroundColor = '#181818', localLabel = 'Local Flows', myLabel = 'My Flows', publicLabel = 'All Published by Users', onTogglePublish, usePortal = false, fullScreen = false, onDeleteLocal, onDeleteRemote, onCreateFolder, onRenameFolder, onMoveFlow, onRenameFlow }) => {
  const [filterLocal, setFilterLocal] = useState('');
  const [filterRemote, setFilterRemote] = useState('');
  // Start with all public owners collapsed so only owner names show initially
  const [collapsedOwners, setCollapsedOwners] = useState<Record<string, boolean>>({});
  const [showMine, setShowMine] = useState(true);
  const [showPublic, setShowPublic] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameInput, setFolderRenameInput] = useState('');
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingFlow, setMovingFlow] = useState<ExplorerFlowItem | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>('');
  const [renamingFlowId, setRenamingFlowId] = useState<string | null>(null);
  const [flowRenameInput, setFlowRenameInput] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  const safeTime = useCallback((flow: ExplorerFlowItem) => {
    if (!flow.updated_at) return 0;
    const ms = Date.parse(flow.updated_at);
    return Number.isNaN(ms) ? 0 : ms;
  }, []);

  const flowComparator = useCallback((a: ExplorerFlowItem, b: ExplorerFlowItem) => {
    if (sortMode === 'updated') {
      const diff = safeTime(b) - safeTime(a);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name);
  }, [sortMode, safeTime]);

  const formatUpdated = (value?: string) => {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'unknown';
    return date.toLocaleString();
  };

  const renderFlowLabel = (flow: ExplorerFlowItem) => (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <span style={{ fontWeight: 500 }}>{flow.name}</span>
      <span style={{ fontSize: 10, opacity: 0.6 }}>
        Saved {formatUpdated(flow.updated_at)}
      </span>
    </div>
  );

  const toggleOwner = (owner: string) => setCollapsedOwners(c => ({ ...c, [owner]: !c[owner] }));

  const filteredLocal = useMemo(() => {
    const filtered = localFlows.filter(f => f.name.toLowerCase().includes(filterLocal.toLowerCase()));
    return [...filtered].sort(flowComparator);
  }, [localFlows, filterLocal, flowComparator]);

  // Build folder tree: include implicit folders from folder_path of flows + explicit folders prop
  const allFolderSet = useMemo(() => {
    const set = new Set<string>();
    folders.forEach(f=> { if(f) set.add(f); });
    filteredLocal.forEach(fl => { if(fl.folder_path){
      const parts = fl.folder_path.split('/').filter(Boolean);
      let acc = '';
      for(const p of parts){ acc = acc ? acc + '/' + p : p; set.add(acc); }
    }});
    return set;
  }, [folders, filteredLocal]);

  const folderTree = useMemo(() => {
    // Represent as map parent->children
    const childrenMap: Record<string, string[]> = {};
    const addChild = (parent: string, child: string) => {
      if(!childrenMap[parent]) childrenMap[parent] = [];
      if(!childrenMap[parent].includes(child)) childrenMap[parent].push(child);
    };
    [...allFolderSet.values()].forEach(path => {
      const parts = path.split('/').filter(Boolean);
      if(parts.length === 0) return;
      const parent = parts.slice(0,-1).join('/') || '';
      addChild(parent, parts[parts.length-1]);
    });
    Object.values(childrenMap).forEach(arr => arr.sort((a,b)=> a.localeCompare(b)));
    return childrenMap;
  }, [allFolderSet]);

  const flowsByFolder = useMemo(() => {
    const map: Record<string, ExplorerFlowItem[]> = {};
    filteredLocal.forEach(fl => {
      const fp = (fl.folder_path || '').trim();
      if(!map[fp]) map[fp] = [];
      map[fp].push(fl);
    });
    Object.values(map).forEach(arr => arr.sort(flowComparator));
    return map;
  }, [filteredLocal, flowComparator]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if(next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const renderFolder = (path: string, level: number): React.ReactNode => {
    const parent = path;
    const name = path.split('/').pop() || path;
    const isExpanded = expandedFolders.has(path);
    const subfolders = folderTree[path] || [];
    const flows = flowsByFolder[path] || [];
    const indent = 10 + level * 12;
    return (
      <div key={path} style={{ marginLeft: indent }}>
        <div style={{ ...rowStyle, display:'flex', alignItems:'center', gap:6, cursor:'pointer', background:'#1e1e1e' }}
             onClick={()=> toggleFolder(path)}>
          <div style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition:'transform .15s', fontSize:10, width:12 }}>▶</div>
          {renamingFolder === path ? (
            <form style={{ flex:1, display:'flex', gap:4 }} onSubmit={e=> { e.preventDefault(); if(onRenameFolder && folderRenameInput.trim() && folderRenameInput.trim() !== path){ onRenameFolder(path, folderRenameInput.trim()); } setRenamingFolder(null); }}>
              <input value={folderRenameInput} onChange={e=> setFolderRenameInput(e.target.value)} style={inputStyle} autoFocus />
              <button type='submit' style={miniBtnStyle}>Save</button>
              <button type='button' style={miniBtnStyle} onClick={()=> setRenamingFolder(null)}>✕</button>
            </form>
          ) : <div style={{ flex:1, fontWeight:600 }}>{name}</div>}
          <div style={{ display:'flex', gap:4 }}>
            <button title='New subfolder' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setCreatingUnder(path); setNewFolderName(''); }}>＋</button>
            <button title='Rename folder' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setRenamingFolder(path); setFolderRenameInput(path); }}>✎</button>
          </div>
        </div>
        {isExpanded && (
          <div style={{ marginTop:4, display:'flex', flexDirection:'column', gap:4 }}>
            {subfolders.map(sf => renderFolder(path ? `${path}/${sf}` : sf, level+1))}
            {flows.map(f => (
              <div key={f.id} style={{ ...rowStyle, marginLeft:6, background:'#262626' }}>
                <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }} onClick={()=> onOpenLocal(f.name, f.folder_path)}>
                  {renamingFlowId === f.id ? (
                    <form style={{ flex:1, display:'flex', gap:4 }} onSubmit={e=> { e.preventDefault(); if(onRenameFlow && flowRenameInput.trim() && flowRenameInput.trim() !== f.name){ onRenameFlow(f, flowRenameInput.trim()); } setRenamingFlowId(null); }}>
                      <input value={flowRenameInput} onChange={e=> setFlowRenameInput(e.target.value)} style={inputStyle} autoFocus />
                      <button type='submit' style={miniBtnStyle}>Save</button>
                      <button type='button' style={miniBtnStyle} onClick={()=> setRenamingFlowId(null)}>✕</button>
                    </form>
                  ) : renderFlowLabel(f)}
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button title='Move flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setMovingFlow(f); setMoveTargetFolder(f.folder_path || ''); }}>↗</button>
                  <button title='Rename flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setRenamingFlowId(f.id); setFlowRenameInput(f.name); }}>✎</button>
                  {onDeleteLocal && <button title='Delete flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); if(confirm(`Delete local flow "${f.name}"?`)){ onDeleteLocal(f.name, f.folder_path); } }}>✕</button>}
                </div>
              </div>
            ))}
            {flows.length === 0 && subfolders.length === 0 && <div style={{ fontSize:11, opacity:.45, marginLeft:6 }}>Empty</div>}
          </div>
        )}
      </div>
    );
  };

  const groupedPublic = useMemo(() => {
    const groups: Record<string, ExplorerFlowItem[]> = {};
    for(const f of publicFlows){
      const owner = f.owner || 'unknown';
      if(!groups[owner]) groups[owner] = [];
      groups[owner].push(f);
    }
    for(const o in groups){ groups[o].sort(flowComparator); }
    return Object.entries(groups).sort((a,b)=> a[0].localeCompare(b[0]));
  }, [publicFlows, flowComparator]);

  const filteredMine = useMemo(() => {
    const filtered = myFlows.filter(f => f.name.toLowerCase().includes(filterRemote.toLowerCase()));
    return [...filtered].sort(flowComparator);
  }, [myFlows, filterRemote, flowComparator]);

  const filteredPublicOwnerGroups = useMemo(() => groupedPublic.map(([owner, flows]) => {
    const filtered = flows.filter(f=> f.name.toLowerCase().includes(filterRemote.toLowerCase()));
    return [owner, [...filtered].sort(flowComparator)] as const;
  }), [groupedPublic, filterRemote, flowComparator]);

  // set of public ids to infer publish state for "My" items if not explicitly provided
  const publicIdSet = useMemo(() => new Set((publicFlows||[]).map(f=> f.id)), [publicFlows]);

  if(!open) return null;

  const hasRemote = (myFlows?.length ?? 0) > 0 || (publicFlows?.length ?? 0) > 0;

  const content = (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems: fullScreen ? 'stretch':'center', justifyContent: fullScreen ? 'stretch':'center', padding: fullScreen ? '0':'0' }} onClick={onClose}>
      <div style={{ background:backgroundColor, color:'#eee', width: fullScreen ? '100%' : '90%', maxWidth: fullScreen ? '100%' : 1100, height: fullScreen ? '100%' : undefined, maxHeight: fullScreen ? '100%' : '85vh', borderRadius: fullScreen ? 0 : 10, boxShadow: fullScreen ? 'none' : '0 8px 32px rgba(0,0,0,.6)', display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e=> e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', padding:'10px 14px', background:headerBackgroundColor, borderBottom:'1px solid #222', gap:12 }}>
          <strong style={{ fontSize:16 }}>{title}</strong>
          {loading && <span style={{ fontSize:12, opacity:.7 }}>Loading...</span>}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
            <span style={{ opacity:0.85 }}>Sort by</span>
            <select
              value={sortMode}
              onChange={(e)=> setSortMode(e.target.value as SortMode)}
              style={{ padding:'3px 6px', background:'#1d1d1d', color:'#fff', border:'1px solid #333', borderRadius:4, fontSize:12 }}
            >
              <option value="name">Name (A-Z)</option>
              <option value="updated">Last saved (newest)</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {onRefresh && <button onClick={onRefresh} style={btnStyle}>Refresh</button>}
            <button onClick={onClose} style={btnStyle}>Close</button>
          </div>
        </div>
        <div style={{ display: hasRemote ? 'grid' : 'flex', gridTemplateColumns: hasRemote ? '1fr 1fr' : undefined, flex:1, minHeight:0 }}>
          {/* Local (Folder Tree) */}
          <div style={{ borderRight: hasRemote ? '1px solid #222' : 'none', display:'flex', flexDirection:'column', minHeight:0, flex: hasRemote ? undefined : 1 }}>
            <div style={{ padding:8, display:'flex', gap:6, alignItems:'center' }}>
              <input placeholder='Filter local...' value={filterLocal} onChange={e=> setFilterLocal(e.target.value)} style={inputStyle} />
              <div style={{ fontSize:12, opacity:.6 }}>{filteredLocal.length}</div>
              {onCreateFolder && <button style={miniBtnStyle} title='Create root folder' onClick={()=> { setCreatingUnder(''); setNewFolderName(''); }}>＋ Folder</button>}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:8 }}>
              {/* Root flows (no folder_path) */}
              {(flowsByFolder[''] || []).map(f => (
                <div key={f.id} style={{ ...rowStyle, background:'#252525' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, cursor:'pointer' }} onClick={()=> onOpenLocal(f.name, f.folder_path)}>
                    {renamingFlowId === f.id ? (
                      <form style={{ flex:1, display:'flex', gap:4 }} onSubmit={e=> { e.preventDefault(); if(onRenameFlow && flowRenameInput.trim() && flowRenameInput.trim() !== f.name){ onRenameFlow(f, flowRenameInput.trim()); } setRenamingFlowId(null); }}>
                        <input value={flowRenameInput} onChange={e=> setFlowRenameInput(e.target.value)} style={inputStyle} autoFocus />
                        <button type='submit' style={miniBtnStyle}>Save</button>
                        <button type='button' style={miniBtnStyle} onClick={()=> setRenamingFlowId(null)}>✕</button>
                      </form>
                    ) : renderFlowLabel(f)}
                  </div>
                  <div style={{ display:'flex', gap:4 }}>
                    <button title='Move flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setMovingFlow(f); setMoveTargetFolder(f.folder_path || ''); }}>↗</button>
                    <button title='Rename flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setRenamingFlowId(f.id); setFlowRenameInput(f.name); }}>✎</button>
                    {onDeleteLocal && <button title='Delete flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); if(confirm(`Delete local flow "${f.name}"?`)){ onDeleteLocal(f.name, f.folder_path); } }}>✕</button>}
                  </div>
                </div>
              ))}
              {/* Folder hierarchy */}
              {[...folderTree[''] || []].map(rootName => renderFolder(rootName, 0))}
              {filteredLocal.length===0 && <div style={{ fontSize:12, opacity:.5 }}>No local flows.</div>}
            </div>
          </div>
          {/* Remote */}
          {hasRemote && <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ padding:8, display:'flex', gap:8, flexWrap:'wrap' }}>
              <input placeholder='Filter remote...' value={filterRemote} onChange={e=> setFilterRemote(e.target.value)} style={inputStyle} />
              <label style={{ fontSize:12 }}><input type='checkbox' checked={showMine} onChange={e=> setShowMine(e.target.checked)} /> My</label>
              <label style={{ fontSize:12 }}><input type='checkbox' checked={showPublic} onChange={e=> setShowPublic(e.target.checked)} /> Public</label>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:8, display:'flex', flexDirection:'column', gap:12 }}>
              {showMine && <div>
                <div style={sectionHeaderStyle}>{myLabel} <span style={{ opacity:.6, fontSize:11 }}>({filteredMine.length})</span></div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {filteredMine.map(f=> (
                    <div key={f.id} style={rowStyle}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer' }} onClick={()=> { if(renamingFlowId !== f.id && onOpenRemote) onOpenRemote(f); }}>
                        {renamingFlowId === f.id ? (
                          <form style={{ flex:1, display:'flex', gap:4 }} onSubmit={e=> { e.preventDefault(); if(onRenameFlow && flowRenameInput.trim() && flowRenameInput.trim() !== f.name){ onRenameFlow(f, flowRenameInput.trim()); } setRenamingFlowId(null); }}>
                            <input value={flowRenameInput} onChange={e=> setFlowRenameInput(e.target.value)} style={inputStyle} autoFocus />
                            <button type='submit' style={miniBtnStyle}>Save</button>
                            <button type='button' style={miniBtnStyle} onClick={()=> setRenamingFlowId(null)}>✕</button>
                          </form>
                        ) : renderFlowLabel(f)}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        {onRenameFlow && <button title='Rename flow' style={miniBtnStyle} onClick={(e)=> { e.stopPropagation(); setRenamingFlowId(f.id); setFlowRenameInput(f.name); }}>✎</button>}
                        {onTogglePublish && (
                          <label style={{ fontSize:12, display:'flex', alignItems:'center', gap:6 }} onClick={e=> e.stopPropagation()}>
                            <input
                              type='checkbox'
                              checked={f.is_public ?? publicIdSet.has(f.id)}
                              onChange={e=> onTogglePublish && onTogglePublish(f, e.target.checked)}
                            />
                            <span style={{ opacity:.8 }}>Published</span>
                          </label>
                        )}
                        {onDeleteRemote && (
                          <button
                            title='Delete remote flow'
                            onClick={(e)=>{ e.stopPropagation(); if(confirm(`Delete remote flow "${f.name}"? This will remove it from the server.`)){ onDeleteRemote(f); } }}
                            style={{ ...miniBtnStyle }}
                          >✕</button>
                        )}
                        <div style={{ fontSize:11, opacity:.5 }}>mine</div>
                      </div>
                    </div>
                  ))}
                  {filteredMine.length===0 && <div style={{ fontSize:12, opacity:.5 }}>No remote flows.</div>}
                </div>
              </div>}
              {showPublic && <div>
                <div style={sectionHeaderStyle}>{publicLabel} <span style={{ opacity:.6, fontSize:11 }}>({publicFlows.length})</span></div>
                {filteredPublicOwnerGroups.map(([owner, flows]) => {
                  if(flows.length===0) return null;
                  // default collapsed unless user toggled open
                  const collapsed = collapsedOwners[owner] !== undefined ? collapsedOwners[owner] : true;
                  return (
                    <div key={owner} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', cursor:'pointer', padding:'4px 6px', background:'#202020', borderRadius:4, border:'1px solid #2d2d2d' }} onClick={()=> toggleOwner(owner)}>
                        <div style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition:'transform .15s', fontSize:10, opacity:.8, width:12 }}>▶</div>
                        <div style={{ fontWeight:500, flex:1 }}>{owner}</div>
                        <div style={{ fontSize:11, opacity:.5 }}>{flows.length}</div>
                      </div>
                      {!collapsed && <div style={{ marginTop:4, display:'flex', flexDirection:'column', gap:4, paddingLeft:14 }}>
                        {flows.map(f=> (
                          <div key={f.id} style={rowStyle} onClick={()=> onOpenRemote && onOpenRemote(f)}>
                            {renderFlowLabel(f)}
                            <div style={{ fontSize:11, opacity:.5 }}>public</div>
                          </div>
                        ))}
                      </div>}
                    </div>
                  );
                })}
              </div>}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );

  const moveDialog = movingFlow && (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=> setMovingFlow(null)}>
      <div style={{ background:'#1f1f1f', border:'1px solid #333', padding:20, width:360, borderRadius:8 }} onClick={e=> e.stopPropagation()}>
        <h3 style={{ margin:'0 0 10px' }}>Move Flow: {movingFlow.name}</h3>
        <select value={moveTargetFolder} onChange={e=> setMoveTargetFolder(e.target.value)} style={{ width:'100%', padding:6, background:'#222', color:'#eee', border:'1px solid #444', borderRadius:4 }}>
          <option value=''>/ (root)</option>
          {[...allFolderSet.values()].sort().map(f=> <option key={f} value={f}>{f}</option>)}
        </select>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button style={miniBtnStyle} onClick={()=> setMovingFlow(null)}>Cancel</button>
          <button style={miniBtnStyle} onClick={()=> { if(onMoveFlow) onMoveFlow(movingFlow, moveTargetFolder); setMovingFlow(null); }}>Move</button>
        </div>
      </div>
    </div>
  );

  const newFolderDialog = creatingUnder !== null && (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=> setCreatingUnder(null)}>
      <div style={{ background:'#1f1f1f', border:'1px solid #333', padding:20, width:360, borderRadius:8 }} onClick={e=> e.stopPropagation()}>
        <h3 style={{ margin:'0 0 10px' }}>Create Folder {creatingUnder ? `in ${creatingUnder}` : 'at root'}</h3>
        <input value={newFolderName} onChange={e=> setNewFolderName(e.target.value)} placeholder='Folder name' style={inputStyle} autoFocus />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button style={miniBtnStyle} onClick={()=> setCreatingUnder(null)}>Cancel</button>
          <button style={miniBtnStyle} onClick={()=> { const seg = newFolderName.trim(); if(seg){ const fullPath = creatingUnder ? (creatingUnder ? (creatingUnder + '/' + seg) : seg) : seg; if(onCreateFolder) onCreateFolder(fullPath); } setCreatingUnder(null); }}>Create</button>
        </div>
      </div>
    </div>
  );

  const mergedContent = (
    <>
      {content}
      {moveDialog}
      {newFolderDialog}
    </>
  );
  if(usePortal && typeof document !== 'undefined'){
    return createPortal(mergedContent, document.body);
  }
  return mergedContent;
};

const btnStyle: React.CSSProperties = { background:'#2a2a2a', color:'#eee', border:'1px solid #333', borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:12 };
const miniBtnStyle: React.CSSProperties = { background:'#3a1a1a', color:'#f2dede', border:'1px solid #552', borderRadius:4, padding:'2px 6px', cursor:'pointer', fontSize:11, lineHeight:'14px' };
const inputStyle: React.CSSProperties = { flex:1, padding:'4px 6px', background:'#1d1d1d', color:'#fff', border:'1px solid #333', borderRadius:4, fontSize:12 };
const rowStyle: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px', background:'#2a2a2a', border:'1px solid #333', borderRadius:4, cursor:'pointer' };
const sectionHeaderStyle: React.CSSProperties = { fontSize:12, textTransform:'uppercase', letterSpacing:'.5px', opacity:.85, margin:'4px 0 6px', fontWeight:600 };

export default ExplorerDialog;
