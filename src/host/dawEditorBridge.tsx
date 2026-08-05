// Editor side of the host (DAW) ↔ Synflow editor bridge. Two hosts use it:
//
//  • Mothscilla (web DAW): opens the editor with URL hash `#mothscilla` as an
//    IFRAME (host = window.parent) or a WINDOW (host = window.opener) and ships
//    the flow over postMessage. A "Send to Mothscilla" button posts edits back.
//    DAW side: packages/daw/src/ui/SynflowEditor.tsx.
//  • Native plugin (VST3/AU): the JUCE webview injects the current flow via
//    WebBrowserComponent initialisationData (PluginEditor.cpp). No postMessage
//    host — we read `window.__JUCE__.initialisationData.flowJson` once on mount
//    and load it into the canvas. Edits sync to the C++ engine via NativeFlowEngine,
//    so there's no "send back" button.
//
// In any normal editor session (no host / no hash / no JUCE) this renders nothing
// and attaches no listeners, so it has zero effect on standalone web use.
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

// JUCE wraps scalar initialisationData values in a single-element array.
function unwrapInit(v: any): any { return Array.isArray(v) ? v[0] : v; }

/** The JUCE plugin webview's injected init data, or null (web app / Mothscilla). */
function juceInitData(): any | null {
  const j = typeof window !== 'undefined' ? (window as any).__JUCE__ : undefined;
  return j && j.initialisationData ? j.initialisationData : null;
}

/** True when running inside the native plugin's webview (vs. web / Mothscilla iframe). */
export function isPluginWebview(): boolean {
  return juceInitData() !== null;
}

/** The flow the plugin handed us to edit (from initialisationData), or null. */
function injectedPluginFlow(): { nodes: any[]; edges: any[]; customUi?: string } | null {
  const data = juceInitData();
  if (!data) return null;
  const raw = unwrapInit(data.flowJson);
  if (raw == null) return null;
  try {
    const flow = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!flow || typeof flow !== 'object') return null;
    return {
      nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
      edges: Array.isArray(flow.edges) ? flow.edges : [],
      customUi: typeof flow.customUi === 'string' ? flow.customUi : undefined,
    };
  } catch {
    return null;
  }
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

export function DawEditorBridge({ nodes, edges, setNodes, setEdges, customUi, onCustomUi }: {
  nodes: AnyArr;
  edges: AnyArr;
  setNodes: (n: AnyArr) => void;
  setEdges: (e: AnyArr) => void;
  // The flow's custom HTML faceplate (flow.customUi): received from the DAW on
  // load, sent back on save, so it round-trips and survives editing in Synflow.
  customUi?: string;
  onCustomUi?: (html: string) => void;
}) {
  const host = bridgeHost();
  const active = !!host;

  // Native plugin webview: no postMessage host — the flow arrives via JUCE
  // initialisationData. Load it into the canvas once on mount. (Mothscilla's
  // postMessage path, below, handles its own load and takes precedence.)
  useEffect(() => {
    if (host) return;
    const flow = injectedPluginFlow();
    if (!flow) return;
    const incoming = flow.nodes.map((n: any, i: number) => ({
      ...n,
      position: n.position ?? { x: 80 + i * 240, y: 120 + (i % 2) * 130 },
    }));
    setNodes(incoming);
    setEdges(flow.edges);
    if (flow.customUi != null) onCustomUi?.(flow.customUi);
    // Mount-once load of the host-supplied flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onCustomUi?.(typeof d.flow.customUi === 'string' ? d.flow.customUi : '');
      try { host.postMessage({ type: 'mothscilla:loaded' }, TARGET); } catch { /* noop */ }
    };
    window.addEventListener('message', onMessage);
    try { host.postMessage({ type: 'mothscilla:ready' }, TARGET); } catch { /* noop */ }
    return () => window.removeEventListener('message', onMessage);
  }, [host, setNodes, setEdges, onCustomUi]);

  if (!active) return null;

  const send = () => {
    const flow = JSON.parse(JSON.stringify({ nodes, edges, ...(customUi ? { customUi } : {}) }));
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
