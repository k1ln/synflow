import React from 'react';
import ReactDOM from 'react-dom/client'; // Use 'react-dom/client' for React 18+
import Flow from './src/Flow';
import { ReactFlowProvider } from '@xyflow/react';

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