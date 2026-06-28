// Plugin webview entry: the SAME dedicated editor the web app uses
// (src/ui/SynflowEditor), mounted in "native mode" — audio is produced by the C++
// plugin engine via createNativeEngine, not Web Audio.
import React from 'react';
import ReactDOM from 'react-dom/client';

import { SynflowEditor } from '../ui/SynflowEditor';
import { createNativeEngine } from '../sys/NativeFlowEngine';

// Floating toggle back to the plugin's play panel (served at the resource root).
function BackToPlay() {
  return (
    <button
      onClick={() => { window.location.href = './index.html'; }}
      style={{
        position: 'fixed', top: 8, left: 8, zIndex: 99999,
        background: '#2a2a30', color: '#e8e8ea', border: '1px solid #3a3a42',
        borderRadius: 6, padding: '6px 10px', font: '12px system-ui', cursor: 'pointer',
      }}
    >
      ← Play
    </button>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BackToPlay />
      <SynflowEditor engineFactory={createNativeEngine} />
    </React.StrictMode>,
  );
}
