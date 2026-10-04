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
import React, { useEffect, useRef, useState } from 'react';

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

// Edits are pushed to the DAW automatically (Mothscilla owns the saving). Wait for
// the user to pause before sending, since each save rebuilds the DAW's engines.
const AUTOSEND_DEBOUNCE_MS = 800;
// UI-only fields that change without the flow itself changing.
const VOLATILE_KEYS = new Set(['selected', 'dragging', 'resizing', 'measured']);
const flowSignature = (nodes: AnyArr, edges: AnyArr, customUi?: string) =>
  JSON.stringify({ nodes, edges, customUi }, (k, v) => (VOLATILE_KEYS.has(k) ? undefined : v));

export function DawEditorBridge({ nodes, edges, setNodes, setEdges, customUi, onCustomUi, attachNodeHandlers }: {
  nodes: AnyArr;
  edges: AnyArr;
  setNodes: (n: AnyArr) => void;
  setEdges: (e: AnyArr) => void;
  // The flow's custom HTML faceplate (flow.customUi): received from the DAW on
  // load, sent back on save, so it round-trips and survives editing in Synflow.
  customUi?: string;
  onCustomUi?: (html: string) => void;
  // Wires editor behaviour onto freshly loaded nodes (node.data.onChange, which
  // nodes like ADSR call to report their edits). Without it, edits to such nodes
  // never reach node.data — so they aren't sent to the DAW or applied live.
  attachNodeHandlers?: (nodes: AnyArr) => void;
}) {
  const host = bridgeHost();
  const active = !!host;
  // Signature of the last flow exchanged with the DAW (loaded from it or sent to it).
  // null = a load just happened and the next settled state becomes the baseline.
  const lastSigRef = useRef<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const latest = useRef({ nodes, edges, customUi });
  latest.current = { nodes, edges, customUi };
  const attachRef = useRef(attachNodeHandlers);
  attachRef.current = attachNodeHandlers;

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
    attachRef.current?.(incoming);
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
      attachRef.current?.(incoming);
      setNodes(incoming);
      setEdges(d.flow.edges ?? []);
      onCustomUi?.(typeof d.flow.customUi === 'string' ? d.flow.customUi : '');
      lastSigRef.current = null; // don't echo the freshly loaded flow back as an "edit"
      try { host.postMessage({ type: 'mothscilla:loaded' }, TARGET); } catch { /* noop */ }
    };
    window.addEventListener('message', onMessage);
    try { host.postMessage({ type: 'mothscilla:ready' }, TARGET); } catch { /* noop */ }
    return () => window.removeEventListener('message', onMessage);
  }, [host, setNodes, setEdges, onCustomUi]);

  const send = () => {
    const { nodes: n, edges: e, customUi: ui } = latest.current;
    const flow = JSON.parse(JSON.stringify({ nodes: n, edges: e, ...(ui ? { customUi: ui } : {}) }));
    try { host!.postMessage({ type: 'mothscilla:save', flow }, TARGET); } catch { /* noop */ }
    lastSigRef.current = flowSignature(n, e, ui);
    setSentAt(Date.now());
  };

  // Auto-send: after the user pauses, push the flow to the DAW if it really changed.
  useEffect(() => {
    if (!host) return;
    const t = window.setTimeout(() => {
      const { nodes: n, edges: e, customUi: ui } = latest.current;
      if (!n.length) return; // nothing loaded yet
      const sig = flowSignature(n, e, ui);
      if (lastSigRef.current === null) { lastSigRef.current = sig; return; } // baseline after load
      if (sig !== lastSigRef.current) send();
    }, AUTOSEND_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, nodes, edges, customUi]);

  useEffect(() => {
    if (!sentAt) return;
    const t = window.setTimeout(() => setSentAt(0), 1800);
    return () => window.clearTimeout(t);
  }, [sentAt]);

  if (!active) return null;

  return (
    <button
      onClick={send}
      title="Changes are sent to Mothscilla automatically — click to send immediately"
      style={{
        position: 'fixed', top: 12, right: 12, zIndex: 99999,
        background: 'linear-gradient(180deg,#1c3a2a,#142a1f)', color: '#6ee7a8',
        border: '1px solid #2f6b4a', borderRadius: 8, padding: '9px 14px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: '0 2px 12px rgba(0,0,0,.5), 0 0 16px rgba(110,231,168,.25)',
      }}
    >
      {sentAt ? '✓ Synced to Mothscilla' : '⇪ Send now'}
    </button>
  );
}
