import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Builds the Synflow single-flow editor (src/plugin-ui) as a self-contained
// bundle for the native plugin's webview (edit mode). Same React app + the
// @synflow/core source alias as the web build; relative base + predictable
// output names so the WebBrowserComponent resource provider can serve it.
export default defineConfig({
  root: fileURLToPath(new URL('./src/plugin-ui', import.meta.url)),
  plugins: [react()],
  base: './',
  // Audio is native (C++), so the web worklets/wasm/images in public/ aren't
  // needed in the plugin bundle — keep it lean (just the editor JS/CSS/HTML).
  publicDir: false,
  resolve: {
    alias: {
      '@synflow/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./native/plugin/webui/editor', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'editor.js',
        chunkFileNames: 'editor-[name].js',
        assetFileNames: 'editor.[ext]',
      },
    },
  },
});
