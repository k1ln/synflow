import React, { useMemo, useState } from 'react';
import { X, BookOpen } from 'lucide-react';
import docs, { DocItem } from '../docs/registry';

export interface DocsPlaygroundProps {
  onClose: () => void;
}

const DocsPlayground: React.FC<DocsPlaygroundProps> = ({ onClose }) => {
  const [activeId, setActiveId] = useState<string>(() => (docs[0]?.id ?? ''));
  const activeDoc = useMemo<DocItem | undefined>(
    () => docs.find((d) => d.id === activeId) ?? docs[0],
    [activeId]
  );

  const Component = activeDoc?.component;

  const renderDescriptionText = (text: string) => {
    const lines = (text || '').split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={idx} style={{ height: 6 }} />;
      }

      const isHeading = !trimmed.startsWith('- ');

      if (isHeading) {
        return (
          <div
            key={idx}
            style={{
              fontWeight: 600,
              fontSize: 13,
              marginTop: idx === 0 ? 0 : 10,
            }}
          >
            {trimmed}
          </div>
        );
      }

      return (
        <div
          key={idx}
          style={{
            fontSize: 12,
            paddingLeft: 14,
          }}
        >
          • {trimmed.slice(2)}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: '#050608f0',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid #191b23',
          background: 'linear-gradient(to right, #050608, #070c11)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid #273048',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0b1020',
              boxShadow:
                '0 1px 3px rgba(0,0,0,0.4), 0 0 10px 2px rgba(0,255,136,0.12)',
            }}
          >
            <BookOpen size={16} color="#8fd0ff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>
              Docs Playground
            </span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              Browse and try documented components in real time.
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 999,
            border: '1px solid #292a3a',
            background: '#10121c',
            color: '#ddd',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Sidebar: docs list */}
        <div
          style={{
            width: 260,
            borderRight: '1px solid #181a24',
            padding: '10px 8px',
            background: '#080a11',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px 6px' }}>
            Components
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {docs.map((doc) => {
              const isActive = activeDoc && doc.id === activeDoc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveId(doc.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid ' + (isActive ? '#255a3b' : 'transparent'),
                    background: isActive ? '#0f1d17' : 'transparent',
                    color: '#e7edf7',
                    cursor: 'pointer',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{doc.title}</div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.7,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {doc.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: description + controls + live preview */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 12,
            gap: 12,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {activeDoc && (
            <>
              {/* Live preview */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 280,
                  width: '100%',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    maxWidth: '100%',
                    borderRadius: 8,
                    border: '1px solid #171b22',
                    background: 'radial-gradient(circle at top left, #1a2730 0, #050608 45%)',
                    padding: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'auto',
                  }}
                >
                  <div
                    style={{
                      minWidth: 120,
                      minHeight: 40,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {Component && (
                      <Component
                        {...(activeDoc?.defaultProps ?? {})}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Description below preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{activeDoc.title}</div>
                <div
                  style={{
                    opacity: 0.8,
                    maxWidth: '100%',
                  }}
                >
                  {renderDescriptionText(activeDoc.description)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocsPlayground;
