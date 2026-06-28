import React from 'react';
import ReactDOM from 'react-dom/client'; // Use 'react-dom/client' for React 18+
import { SynflowEditor } from './src/ui/SynflowEditor';

// The shared editor (src/ui/SynflowEditor) wires the browser host adapters into
// @synflow/core and renders the flow with the default Web Audio engine. The
// native plugin mounts the same component with a C++ engineFactory.
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement); // Create a root
    root.render(
        <React.StrictMode>
            <SynflowEditor />
        </React.StrictMode>
    );
}