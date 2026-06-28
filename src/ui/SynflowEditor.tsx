// The dedicated, reusable Synflow single-flow editor — the one component both
// the web app and the native plugin mount. It wires the browser host capabilities
// (buttons / MIDI / sub-flow loading / assets) into @synflow/core once, wraps the
// editor in ReactFlowProvider, and renders Flow with an injectable engine:
//   - web:    <SynflowEditor />                              (default Web Audio engine)
//   - plugin: <SynflowEditor engineFactory={createNativeEngine} />  (audio in C++)
//
// The editor source (Flow.tsx + components/nodes/...) stays in the app; this is the
// shared seam that keeps the two consumers in sync. (A formal @synflow/ui package
// would later just relocate these files.)
import { ReactFlowProvider } from '@xyflow/react';
import { setHostAdapters, type ButtonInput } from '@synflow/core';

import Flow from '../Flow';
import EventManager from '../sys/EventManager';
import MidiManager from '../components/MidiManager';
import { browserFlowLoader } from '../host/browserFlowLoader';
import { browserAssetStore } from '../host/browserAssetStore';
import type { FlowEngineFactory } from '../sys/IFlowEngine';

// Wire browser host capabilities into the headless @synflow/core engine, once.
// Delegates to the *current* EventManager so it survives resetInstance().
let hostWired = false;
function wireBrowserHost(): void {
  if (hostWired) return;
  hostWired = true;
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
}

export interface SynflowEditorProps {
  /** Audio engine for the editor. Omit for the default Web Audio engine (web);
   *  pass createNativeEngine to render the flow in the C++ plugin engine. */
  engineFactory?: FlowEngineFactory;
}

export function SynflowEditor({ engineFactory }: SynflowEditorProps = {}) {
  wireBrowserHost();
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlowProvider>
        <Flow engineFactory={engineFactory} />
      </ReactFlowProvider>
    </div>
  );
}

export default SynflowEditor;
