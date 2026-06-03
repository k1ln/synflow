// Bridge to the synflow editor running in a SEPARATE window. The DAW hands a
// flow to the editor; the user edits the node graph there and clicks
// "Send to Mothscilla"; the edited flow comes back here so we can live-reload
// the instrument/FX. Editor side: src/host/dawEditorBridge.tsx in the editor app.
//
// Protocol (postMessage, cross-origin):
//   editor → DAW   { type: 'mothscilla:ready' }     editor mounted, send me the flow
//   DAW    → editor { type: 'mothscilla:load', flow }  load this flow into the canvas
//   editor → DAW   { type: 'mothscilla:loaded' }    flow applied (stop retrying)
//   editor → DAW   { type: 'mothscilla:save', flow }  user pressed "Send to Mothscilla"
import type { Flow } from './instruments';

const EDITOR_URL = (import.meta.env.VITE_SYNFLOW_URL as string | undefined) ?? 'http://localhost:5173';

export interface EditorSession { close: () => void }

/**
 * Open `flow` in the synflow editor (new window) and call `onSaved` every time
 * the user sends the edited flow back. Returns a handle to stop listening.
 */
export function openInSynflow(flow: Flow, onSaved: (flow: Flow) => void): EditorSession {
  const url = new URL(EDITOR_URL);
  url.hash = 'mothscilla';
  const editorOrigin = url.origin;
  const win = window.open(url.toString(), 'synflow-editor');
  if (!win) {
    alert('Pop-up blocked — allow pop-ups for Mothscilla to edit flows in Synflow.');
    return { close: () => {} };
  }
  win.focus();

  let loaded = false;
  const post = () => { try { win.postMessage({ type: 'mothscilla:load', flow }, editorOrigin); } catch { /* closed */ } };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== win) return;
    if (editorOrigin !== 'null' && e.origin !== editorOrigin) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mothscilla:ready') post();
    else if (d.type === 'mothscilla:loaded') loaded = true;
    else if (d.type === 'mothscilla:save' && d.flow) onSaved(d.flow as Flow);
  };
  window.addEventListener('message', onMessage);

  // Resend the flow until the editor confirms it loaded (covers the race where
  // the editor posts "ready" before this listener is attached).
  let tries = 0;
  const timer = window.setInterval(() => {
    if (loaded || win.closed || tries++ > 40) { window.clearInterval(timer); return; }
    post();
  }, 250);

  const close = () => { window.removeEventListener('message', onMessage); window.clearInterval(timer); };
  return { close };
}
