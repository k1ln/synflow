import React from 'react';
import ReactDOM from 'react-dom/client'; // Use 'react-dom/client' for React 18+
import Flow from './src/Flow';
import { ReactFlowProvider } from '@xyflow/react';
import { setHostAdapters, type ButtonInput } from '@synflow/core';
import EventManager from './src/sys/EventManager';
import MidiManager from './src/components/MidiManager';
import { browserFlowLoader } from './src/host/browserFlowLoader';
import { browserAssetStore } from './src/host/browserAssetStore';

// Wire browser host capabilities into the headless @synflow/core engine.
// The input adapter delegates to the *current* EventManager so it survives
// EventManager.resetInstance() (called by Flow when swapping flows).
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
    const root = ReactDOM.createRoot(rootElement); // Create a root
    root.render(
        <React.StrictMode>

            <div style={{ width: '100%', height: '100vh' }}>
                <ReactFlowProvider>
                    <Flow />
                </ReactFlowProvider>
            </div>

        </React.StrictMode>
    );
}