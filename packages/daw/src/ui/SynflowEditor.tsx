import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Flow } from '../synflow/instruments';

// URL of the synflow editor, resolved by hostname at runtime rather than baked
// in at build time — the DAW loads correctly wherever it's served from. On
// localhost, the local dev editor; anywhere else (synflow.org, mothscilla.org,
// or any other host) the production editor at synflow.org. Cross-origin
// framing works via postMessage — synflow.org needs to allow being framed
// (Content-Security-Policy: frame-ancestors / X-Frame-Options).
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const EDITOR_URL = isLocalhost ? 'http://localhost:5173' : 'https://synflow.org';

/**
 * In-app "Edit in Synflow" panel: embeds the synflow editor in an iframe, hands
 * it `flow`, and calls `onSaved` each time the user presses "Send to Mothscilla".
 * Protocol mirrors src/host/dawEditorBridge.tsx in the editor app.
 */
export function SynflowEditor({ flow, title, onSaved, onClose }: {
  flow: Flow;
  title: string;
  onSaved: (flow: Flow) => void;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved; // always call the latest, without re-running the effect
  const [savedAt, setSavedAt] = useState(0);

  const editorOrigin = new URL(EDITOR_URL, window.location.href).origin;
  const src = (() => { const u = new URL(EDITOR_URL, window.location.href); u.hash = 'mothscilla'; return u.toString(); })();

  useEffect(() => {
    loadedRef.current = false;
    const post = () => {
      try { frameRef.current?.contentWindow?.postMessage({ type: 'mothscilla:load', flow }, editorOrigin); } catch { /* noop */ }
    };
    const onMessage = (e: MessageEvent) => {
      // Accept by source identity OR editor origin (robust across iframe remounts).
      const fromEditor = e.source === frameRef.current?.contentWindow || e.origin === editorOrigin;
      const d = e.data;
      if (!fromEditor || !d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('mothscilla:')) return;
      if (d.type === 'mothscilla:ready') post();
      else if (d.type === 'mothscilla:loaded') loadedRef.current = true;
      else if (d.type === 'mothscilla:save' && d.flow) {
        // eslint-disable-next-line no-console
        console.info('[Mothscilla] received edited flow from Synflow', d.flow);
        savedRef.current(d.flow as Flow);
        setSavedAt(Date.now());
      }
    };
    window.addEventListener('message', onMessage);
    // Resend until the editor confirms it loaded (covers the ready/listener race).
    let tries = 0;
    const timer = window.setInterval(() => { if (loadedRef.current || tries++ > 40) window.clearInterval(timer); else post(); }, 250);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(timer); };
  }, [flow, editorOrigin]);

  // Clear the "updated" badge after a moment.
  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(0), 2200);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  return (
    <div className="syn-overlay" onClick={onClose}>
      <div className="syn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="syn-head">
          <span className="syn-dot" />
          <span className="syn-title">Edit in Synflow — {title}</span>
          {savedAt
            ? <span className="syn-saved"><Check size={13} /> Updated in Mothscilla</span>
            : <span className="syn-hint">edit the graph, then press “⇪ Send to Mothscilla”</span>}
          <button className="syn-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <iframe ref={frameRef} className="syn-frame" src={src} title="Synflow editor" allow="microphone; autoplay" />
      </div>
    </div>
  );
}
