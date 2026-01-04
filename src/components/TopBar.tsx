import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload, Download, LogIn, LogOut, User, FolderOpen, Share2, RefreshCw, Plus, Settings, HardDriveDownload, Database, FilePlus, FileInput, FileOutput, Play, Square, MoreHorizontal, Mic, Music } from 'lucide-react';

export interface TopBarProps {
  // Left cluster (sidebar-related)
  onNewFlow?: () => void;
  onOpenFlow: () => void;
  onTogglePalette?: () => void;
  onToggleInspector?: () => void;

  // Right cluster (bottom-bar related)
  onSaveFlow?: () => void;
  onSaveAsFlow?: () => void;
  onExportFlowJson?: () => void;
  onExportAllJson?: () => void;
  onImportFlowJsonClick?: () => void;
  onImportAllJsonClick?: () => void;
  onInitAudio?: () => void;
  onStopAudio?: () => void;
  isPlaying?: boolean; // indicates audio graph started
  onOpenImpressum?: () => void;
  onOpenDatenschutz?: () => void;
  statusLabel?: string;
  selectedNodeType?: string;
  // Current open entity info
  currentItemType?: 'flow' | 'component';
  currentItemName?: string;
  onRenameCurrent?: (newName: string) => void; // callback when user commits rename
  showCurrentRow?: boolean; // force show second row even if name missing
  // Color pickers for current selection
  nodeGlowColor?: string;
  nodeBgColor?: string;
  nodeFontColor?: string;
  edgeColor?: string;
  onNodeGlowColorChange?: (color: string) => void;
  onNodeBgColorChange?: (color: string) => void;
  onNodeFontColorChange?: (color: string) => void;
  onEdgeColorChange?: (color: string) => void;

  // File System folder information
  audioFolderName?: string; // name of the selected audio folder
  audioFolderMissing?: boolean; // flag indicating no folder selected / permission lost
  onSelectAudioFolder?: () => void; // trigger folder picker
  onChangeAudioFolder?: () => void; // change current audio folder
}

// Icon-only button with tooltip
const IconBtn: React.FC<{ title: string; onClick?: () => void; disabled?: boolean; bgColor?: string; playing?: boolean; children: React.ReactNode }>
  = ({ title, onClick, disabled, bgColor, playing, children }) => (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`topbar-btn${playing ? ' playing' : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6, background: bgColor || '#1f1f1f', color: '#eee',
        border: '1px solid #333', cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >{children}</button>
  );

const Divider: React.FC = () => <div style={{ width: 1, height: 20, background: '#333', margin: '0 8px' }} />;

export const TopBar: React.FC<TopBarProps> = ({
  onNewFlow, 
  onOpenFlow, 
  onTogglePalette, 
  onToggleInspector,
  onSaveFlow, 
  onSaveAsFlow, 
  onExportFlowJson, 
  onExportAllJson, 
  onImportFlowJsonClick, 
  onImportAllJsonClick, 
  onInitAudio, 
  onStopAudio,
  isPlaying, 
  onOpenImpressum, 
  onOpenDatenschutz, 
  statusLabel,
  selectedNodeType,
  currentItemType, 
  currentItemName, 
  onRenameCurrent,
  showCurrentRow,
  nodeGlowColor, 
  nodeBgColor, 
  nodeFontColor, 
  edgeColor, 
  onNodeGlowColorChange, 
  onNodeBgColorChange, 
  onNodeFontColorChange, 
  onEdgeColorChange,
  audioFolderName,
  audioFolderMissing,
  onSelectAudioFolder,
  onChangeAudioFolder,
}) => {
  const showCurrent = (currentItemName && currentItemName.length > 0);
  const [ioMenuOpen, setIoMenuOpen] = useState(false);
  const ioMenuRef = useRef<HTMLDivElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(currentItemName || '');
  useEffect(()=>{ if(!editingName) setDraftName(currentItemName||''); }, [currentItemName, editingName]);

  // unified outside click & escape close for both menus
  useEffect(() => {
    if (!ioMenuOpen) return;
    const handleMouse = (e: MouseEvent) => {
      if (ioMenuRef.current && ioMenuRef.current.contains(e.target as Node)) return;
      setIoMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIoMenuOpen(false); };
    window.addEventListener('mousedown', handleMouse);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleMouse);
      window.removeEventListener('keydown', handleKey);
    };
  }, [ioMenuOpen]);
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#0e0e0e', borderBottom: '1px solid #222', zIndex: 1100 }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
        {/* Left cluster: direct flow actions & sidebar toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onNewFlow && <IconBtn title="New Flow" onClick={onNewFlow}><FilePlus size={18} /></IconBtn>}
          <IconBtn title="Open Flow" onClick={onOpenFlow}><FolderOpen size={18} /></IconBtn>
          {onTogglePalette && <IconBtn title="Toggle Palette" onClick={onTogglePalette}><Plus size={18} /></IconBtn>}
          {onToggleInspector && <IconBtn title="Toggle Inspector" onClick={onToggleInspector}><Settings size={18} /></IconBtn>}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {showCurrent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, maxWidth: '60%', overflow: 'hidden' }}>
              <span style={{
                padding: '2px 10px',
                borderRadius: 14,
                background: currentItemType === 'component' ? '#1d2435' : '#152a1d',
                border: '1px solid ' + (currentItemType === 'component' ? '#2f3b55' : '#244d35'),
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: .5,
                color: '#eee'
              }}>{currentItemType === 'component' ? 'Component' : 'Flow'}</span>
              {!editingName && (
                <span
                  title={currentItemType==='flow' ? 'Click to rename flow' : undefined}
                  onClick={() => { if(currentItemType==='flow') setEditingName(true); }}
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 500,
                    color: currentItemType==='flow' ? '#d0eaff' : '#ccc',
                    cursor: currentItemType==='flow' ? 'text' : 'default',
                    borderBottom: currentItemType==='flow' ? '1px dashed #335' : 'none'
                  }}>{currentItemName}</span>
              )}
              {editingName && (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e)=> setDraftName(e.target.value)}
                  onBlur={()=>{
                    setEditingName(false);
                    if(draftName.trim() && draftName.trim() !== currentItemName && onRenameCurrent){
                      onRenameCurrent(draftName.trim());
                    }
                  }}
                  onKeyDown={(e)=>{
                    if(e.key==='Enter'){
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    } else if(e.key==='Escape'){ e.preventDefault(); setEditingName(false); setDraftName(currentItemName||''); }
                  }}
                  style={{
                    width: '160px',
                    background: '#111',
                    color: '#eee',
                    border: '1px solid #355',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 500
                  }}
                  placeholder='Flow name'
                />
              )}
            </div>
          )}
        </div>

        {/* Right cluster: former bottom bar actions + selection color pickers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {selectedNodeType && (
            <div
              style={{
                fontSize: 11,
                opacity: .9,
                padding: '2px 8px',
                border: '1px solid #333',
                borderRadius: 999,
                background: '#162333',
                color: '#8fd0ff',
                whiteSpace: 'nowrap'
              }}
            >
              {selectedNodeType}
            </div>
          )}
          {/* Selection color controls (show only when values provided) */}
          {(nodeGlowColor !== undefined || nodeBgColor !== undefined || nodeFontColor !== undefined || edgeColor !== undefined) && <Divider />}
          {nodeGlowColor !== undefined && onNodeGlowColorChange && (
            <label title="Node glow color" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ddd', fontSize: 12 }}>
              Node Glow
              <input type="color" value={nodeGlowColor} onChange={(e) => onNodeGlowColorChange(e.target.value)} style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </label>
          )}
          {nodeBgColor !== undefined && onNodeBgColorChange && (
            <label title="Node background color" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ddd', fontSize: 12 }}>
              Background
              <input type="color" value={nodeBgColor} onChange={(e) => onNodeBgColorChange(e.target.value)} style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </label>
          )}
          {/* Font color picker removed by request */}
          {edgeColor !== undefined && onEdgeColorChange && (
            <label title="Edge color" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ddd', fontSize: 12 }}>
              Edge
              <input type="color" value={edgeColor} onChange={(e) => onEdgeColorChange(e.target.value)} style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </label>
          )}
          {(nodeGlowColor !== undefined || nodeBgColor !== undefined || nodeFontColor !== undefined || edgeColor !== undefined) && <Divider />}

          {/* Import/Export grouped into context menu */}
          {(onExportFlowJson || onExportAllJson || onImportFlowJsonClick || onImportAllJsonClick) && (
            <div style={{ position: 'relative' }} ref={ioMenuRef}>
              <IconBtn title={ioMenuOpen ? 'Close Import/Export Menu' : 'Import / Export'} onClick={() => { setIoMenuOpen(o => !o); }}>
                <MoreHorizontal size={18} />
              </IconBtn>
              {ioMenuOpen && (
                <div style={{ position: 'absolute', top: 40, right: 0, background: '#171717', border: '1px solid #2a2a2a', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'row', gap: 4, boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>
                  {onExportFlowJson && <IconBtn title="Export Current Flow" onClick={() => { onExportFlowJson(); setIoMenuOpen(false); }}><FileOutput size={14} /></IconBtn>}
                  {onExportAllJson && <IconBtn title="Export ALL" onClick={() => { onExportAllJson(); setIoMenuOpen(false); }}><Download size={14} /></IconBtn>}
                  {onImportFlowJsonClick && <IconBtn title="Import Flow" onClick={() => { onImportFlowJsonClick(); setIoMenuOpen(false); }}><FileInput size={14} /></IconBtn>}
                  {onImportAllJsonClick && <IconBtn title="Import ALL" onClick={() => { onImportAllJsonClick(); setIoMenuOpen(false); }}><Upload size={14} /></IconBtn>}
                </div>
              )}
            </div>
          )}

          <Divider />

          {/* Save & Publish (flow) */}
          {onSaveFlow && <IconBtn title="Save Flow" onClick={onSaveFlow}><Save size={18} /></IconBtn>}
          {/* Save As (flow) only when not a component */}
          {onSaveAsFlow && currentItemType !== 'component' && <IconBtn title="Save Flow As" onClick={onSaveAsFlow}><HardDriveDownload size={18} /></IconBtn>}
          
          <Divider />
          {onInitAudio && <IconBtn title={isPlaying ? 'Audio Started' : 'Initialize AudioGraph'} onClick={onInitAudio} playing={!!isPlaying}><Play size={18} /></IconBtn>}
          {onStopAudio && isPlaying && <IconBtn title="Stop Audio" onClick={onStopAudio}><Square size={18} /></IconBtn>}
          {statusLabel && <div style={{ fontSize: 11, opacity: .8, padding: '2px 8px', border: '1px solid #333', borderRadius: 999, background: '#1a1a1a' }}>{statusLabel}</div>}

          <Divider />

          {/* Recordings panel toggle (if provided) */}
          {(window as any).flowSynth?.toggleRecordingsPanel && !audioFolderMissing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                title={audioFolderName ? `Audio Assets (${audioFolderName})` : "Audio Assets"}
                onClick={() => (window as any).flowSynth.toggleRecordingsPanel()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 10px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: '#1f1f1f',
                  border: '1px solid #2a3139',
                  borderRadius: 6,
                  boxShadow:
                    '0 1px 3px rgba(0,0,0,0.45), ' +
                    '0 0 8px 2px rgba(0,255,136,0.08)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#eee',
                }}
              >
                <Music size={16} style={{ opacity: 0.9 }} />
                {audioFolderName && (
                  <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 2 }}>
                    {audioFolderName}
                  </span>
                )}
              </div>
              {onChangeAudioFolder && (
                <IconBtn
                  title="Change Audio Folder"
                  onClick={onChangeAudioFolder}
                >
                  <FolderOpen size={14} />
                </IconBtn>
              )}
            </div>
          )}
          {audioFolderMissing && onSelectAudioFolder && (
            <div
              title="Select Audio Folder"
              onClick={() => onSelectAudioFolder() }
              style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                height: 32, padding:'0 12px', cursor:'pointer', userSelect:'none',
                background:'#221f1f', border:'1px solid #553131', borderRadius:6,
                boxShadow:'0 1px 4px rgba(0,0,0,0.55), 0 0 10px 2px rgba(255,64,0,0.15)',
                fontSize:12, fontWeight:500, color:'#ffb38a'
              }}
            >
              <FolderOpen size={16} style={{ opacity:.95 }} />
              <span style={{ fontSize:11 }}>Pick Audio Folder</span>
            </div>
          )}

          <Divider />

          {onOpenImpressum && <IconBtn title="Impressum" onClick={onOpenImpressum}><Download size={18} /></IconBtn>}
          {onOpenDatenschutz && <IconBtn title="Datenschutz" onClick={onOpenDatenschutz}><Database size={18} /></IconBtn>}
        </div>
      </div>
    </div>
  );
};
export default TopBar;
