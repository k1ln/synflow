// Plugin webview entry: the SAME dedicated editor the web app uses
// (src/ui/SynflowEditor), mounted in "native mode" — audio is produced by the C++
// plugin engine via createNativeEngine, not Web Audio.
import React from 'react';
import ReactDOM from 'react-dom/client';

import { SynflowEditor } from '../ui/SynflowEditor';
import { createNativeEngine } from '../sys/NativeFlowEngine';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SynflowEditor engineFactory={createNativeEngine} />
    </React.StrictMode>,
  );
}
