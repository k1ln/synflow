import React, { useState, useMemo, useEffect } from 'react';
import { Folder, File, Music, ChevronRight, ChevronDown, Play, Download, Trash2, X, Search } from 'lucide-react';

interface AudioItem {
  id: string;
  name: string;
  _origin: 'local' | 'fs' | 'uploaded';
  _folder?: string;
  url?: string;
  base64?: string;
  data?: string;
  content?: string;
  durationMs?: number;
  size?: number;
  createdAt?: string;
}

interface AudioExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: AudioItem[];
  allFolderAudio?: Record<string, AudioItem[]>; // all subdirectories and their files
  uploadedAudio: AudioItem[];
  onPlay: (item: AudioItem) => void;
  onDownload: (item: AudioItem) => void;
  onDelete: (item: AudioItem) => void;
}

type ViewMode = 'list' | 'grid';
type SortBy = 'name' | 'date' | 'type';

const AudioExplorer: React.FC<AudioExplorerProps> = ({
  isOpen,
  onClose,
  recordings,
  allFolderAudio = {},
  uploadedAudio,
  onPlay,
  onDownload,
  onDelete,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const initial = new Set(['recordings', 'uploaded']);
    // Auto-expand all folder names from allFolderAudio
    Object.keys(allFolderAudio).forEach(folder => initial.add(folder));
    return initial;
  });
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const folders = useMemo(() => {
    const result: any[] = [];
    
    // Add all filesystem folders dynamically
    Object.entries(allFolderAudio).forEach(([folderName, items]) => {
      result.push({
        id: folderName,
        name: folderName.charAt(0).toUpperCase() + folderName.slice(1),
        items: items.map(r => ({ ...r, _origin: r._origin || 'fs' as const })),
        icon: <Folder size={16} />,
      });
    });
    
    // Add uploaded audio folder if there are any
    if (uploadedAudio.length > 0) {
      result.push({
        id: 'uploaded',
        name: 'Uploaded',
        items: uploadedAudio,
        icon: <Music size={16} />,
      });
    }
    
    return result;
  }, [allFolderAudio, uploadedAudio]);

  const filterBySearch = (items: AudioItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item._folder?.toLowerCase().includes(query)
    );
  };

  // Auto-expand folders when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      // Expand all folders that have matching results
      const foldersWithMatches = folders
        .filter(folder => filterBySearch(folder.items).length > 0)
        .map(folder => folder.id);
      setExpandedFolders(new Set(foldersWithMatches));
    }
  }, [searchQuery, folders]);

  const sortItems = (items: AudioItem[]) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'date':
        sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'type':
        sorted.sort((a, b) => (a._origin || '').localeCompare(b._origin || ''));
        break;
    }
    return sorted;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        maxWidth: '90vw',
        background: '#0d0d0d',
        borderLeft: '1px solid #2a2a2a',
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #2a2a2a',
          background: '#151515',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Music size={18} style={{ color: '#00ff88' }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e0e0e0' }}>Audio Assets</h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#222'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <X size={18} />
        </button>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid #1a1a1a',
          background: '#0f0f0f',
        }}
      >
        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search audio files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              color: '#ccc',
              fontSize: 12,
              padding: '6px 8px 6px 32px',
              outline: 'none',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#00ff88'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#2a2a2a'}
          />
        </div>
        
        {/* Stats and Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#888', marginRight: 'auto' }}>
            {folders.reduce((sum, f) => sum + f.items.length, 0)} items
          </span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            style={{
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: '#ccc',
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {folders.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          const filteredItems = filterBySearch(folder.items);
          const sortedItems = sortItems(filteredItems);

          return (
            <div key={folder.id}>
              {/* Folder Header */}
              <div
                onClick={() => toggleFolder(folder.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {isExpanded ? <ChevronDown size={16} color="#888" /> : <ChevronRight size={16} color="#888" />}
                <span style={{ color: '#888' }}>{folder.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ccc', flex: 1 }}>
                  {folder.name}
                </span>
                <span style={{ fontSize: 11, color: '#666' }}>
                  {filteredItems.length}
                </span>
              </div>

              {/* Folder Items */}
              {isExpanded && (
                <div style={{ marginLeft: 24 }}>
                  {sortedItems.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: 12, color: '#555', fontStyle: 'italic' }}>
                      No items
                    </div>
                  ) : (
                    sortedItems.map(item => {
                      const isSelected = selectedItem === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItem(item.id)}
                          style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            background: isSelected ? '#1a2a1a' : 'transparent',
                            borderLeft: isSelected ? '2px solid #00ff88' : '2px solid transparent',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) e.currentTarget.style.background = '#151515';
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <File size={14} color="#888" />
                            <span
                              style={{
                                fontSize: 12,
                                color: '#ddd',
                                fontWeight: isSelected ? 600 : 400,
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#666', marginBottom: 8 }}>
                            <span>{formatDuration(item.durationMs)}</span>
                            {item.size && <span>• {formatSize(item.size)}</span>}
                            <span style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{item._origin}</span>
                          </div>
                          {isSelected && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlay(item);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  background: '#1a4d2e',
                                  border: '1px solid #2a6d3e',
                                  borderRadius: 4,
                                  color: '#fff',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#2a6d3e'}
                                onMouseLeave={e => e.currentTarget.style.background = '#1a4d2e'}
                              >
                                <Play size={12} />
                                Play
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownload(item);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  background: '#222',
                                  border: '1px solid #333',
                                  borderRadius: 4,
                                  color: '#ccc',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                                onMouseLeave={e => e.currentTarget.style.background = '#222'}
                              >
                                <Download size={12} />
                                Download
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(item);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  background: '#3a1212',
                                  border: '1px solid #5a1a1a',
                                  borderRadius: 4,
                                  color: '#ff8888',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#5a1a1a'}
                                onMouseLeave={e => e.currentTarget.style.background = '#3a1212'}
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AudioExplorer;
