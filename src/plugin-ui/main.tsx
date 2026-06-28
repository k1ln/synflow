// Plugin webview entry: the SAME Synflow single-flow editor (src/Flow.tsx),
// mounted in "native mode" — audio is produced by the C++ plugin engine via
// NativeFlowEngine (createNativeEngine), not Web Audio. The editor source stays
// shared with the web app; this entry is bundled and embedded in the plugin.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { setHostAdapters, type ButtonInput } from '@synflow/core';

import Flow from '../Flow';
import EventManager from '../sys/EventManager';
import MidiManager from '../components/MidiManager';
import { browserFlowLoader } from '../host/browserFlowLoader';
import { browserAssetStore } from '../host/browserAssetStore';
import { createNativeEngine } from '../sys/NativeFlowEngine';

// Editor-UI host capabilities (buttons/MIDI/sub-flow loading/assets) still come
// from the webview's browser context; only AUDIO is redirected to C++.
const inputProxy: ButtonInput = {
  addButtonDownCallback: (k, id, cb) => EventManager.getInstance().addButtonDownCallback(k, id, cb),
  addButtonUpCallback: (k, id, cb) => EventManager.getInstance().addButtonUpCallback(k, id, cb),
  removeButtonDownCallback: (k, id) => EventManager.getInstance().removeButtonDownCallback(k, id),
  removeButtonUpCallback: (k, id) => EventManager.getInstance().removeButtonUpCallback(k, id),
  clearButtonCallbacks: () => EventManager.getInstance().clearButtonCallbacks?.(),
};
setHostAdapters({
  input: inputProxy,
  midi: MidiManager.getInstance(),
  flowLoader: browserFlowLoader,
  assetStore: browserAssetStore,
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <div style={{ width: '100%', height: '100vh' }}>
        <ReactFlowProvider>
          <Flow engineFactory={createNativeEngine} />
        </ReactFlowProvider>
      </div>
    </React.StrictMode>,
  );
}
