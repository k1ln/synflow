import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import './tokens.css';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
