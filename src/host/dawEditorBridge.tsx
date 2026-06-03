// Editor side of the Mothscilla (DAW) ↔ Synflow editor bridge.
//
// When the editor is opened by the DAW (URL hash `#mothscilla`) — either as a
// same-origin/cross-origin IFRAME (host = window.parent) or a separate WINDOW
// (host = window.opener) — this component receives the flow to edit, loads it
// into the canvas, and shows a "Send to Mothscilla" button that posts the edited
// flow back to the DAW. DAW side: packages/daw/src/ui/SynflowEditor.tsx.
//
// In any normal editor session (no host / no hash) this renders nothing and
// attaches no listeners, so it has zero effect on standalone use.
import React, { useEffect } from 'react';

// We don't know the DAW's origin up front; the DAW verifies `event.source`, and
// the payload is only flow JSON, so '*' is acceptable here.
const TARGET = '*';

/** The DAW window hosting us: the opener (popup) or the parent (iframe), if any. */
function bridgeHost(): Window | null {
  if (typeof window === 'undefined' || !window.location.hash.includes('mothscilla')) return null;
  if (window.opener) return window.opener as Window;
  if (window.parent && window.parent !== window) return window.parent;
  return null;
}

/**
 * True when the editor is embedded by Mothscilla for flow editing. In this mode
 * the app should hide its chrome (top bar, panels) and NOT restore the last
 * opened flow — the DAW is the source of the flow.
 */
export function isDawEditMode(): boolean {
  return bridgeHost() !== null;
}

type AnyArr = any[];

export function DawEditorBridge({ nodes, edges, setNodes, setEdges }: {
  nodes: AnyArr;
  edges: AnyArr;
  setNodes: (n: AnyArr) => void;
  setEdges: (e: AnyArr) => void;
}) {
  const host = bridgeHost();
  const active = !!host;

  useEffect(() => {
    if (!host) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== host) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'mothscilla:load' || !d.flow) return;
      // Ensure every node has a position so the graph is readable.
      const incoming = (d.flow.nodes ?? []).map((n: any, i: number) => ({
        ...n,
        position: n.position ?? { x: 80 + i * 240, y: 120 + (i % 2) * 130 },
      }));
      setNodes(incoming);
      setEdges(d.flow.edges ?? []);
      try { host.postMessage({ type: 'mothscilla:loaded' }, TARGET); } catch { /* noop */ }
    };
    window.addEventListener('message', onMessage);
    try { host.postMessage({ type: 'mothscilla:ready' }, TARGET); } catch { /* noop */ }
    return () => window.removeEventListener('message', onMessage);
  }, [host, setNodes, setEdges]);

  if (!active) return null;

  const send = () => {
    const flow = JSON.parse(JSON.stringify({ nodes, edges }));
    try { host!.postMessage({ type: 'mothscilla:save', flow }, TARGET); } catch { /* noop */ }
  };

  return (
    <button
      onClick={send}
      title="Send the edited flow back to Mothscilla"
      style={{
        position: 'fixed', top: 12, right: 12, zIndex: 99999,
        background: 'linear-gradient(180deg,#1c3a2a,#142a1f)', color: '#6ee7a8',
        border: '1px solid #2f6b4a', borderRadius: 8, padding: '9px 14px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: '0 2px 12px rgba(0,0,0,.5), 0 0 16px rgba(110,231,168,.25)',
      }}
    >
      ⇪ Send to Mothscilla
    </button>
  );
}
