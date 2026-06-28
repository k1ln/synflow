import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// The granular AudioWorklet + its WASM live in the repo-root public/ (shared with
// the Synflow app, where they're actively developed). VirtualGranularNode loads
// them from "/GranularProcessor.js" and "/granular.wasm", so the DAW must serve
// them at its root too. Rather than copy (and drift from the canonical files),
// serve them straight from the root public/ in dev and emit them on build.
const ROOT_PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));
const SHARED_ROOT_ASSETS = ['GranularProcessor.js', 'granular.wasm'];

function sharedRootAssets(): Plugin {
  const read = (name: string) => readFileSync(`${ROOT_PUBLIC}/${name}`);
  return {
    name: 'serve-shared-root-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url || '').split('?')[0].replace(/^\//, '');
        if (!SHARED_ROOT_ASSETS.includes(name)) return next();
        try {
          res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
          res.end(read(name));
        } catch { next(); }
      });
    },
    generateBundle() {
      for (const name of SHARED_ROOT_ASSETS) {
        try { this.emitFile({ type: 'asset', fileName: name, source: read(name) }); } catch { /* missing → skip */ }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), sharedRootAssets()],
  resolve: {
    alias: {
      // Dev resolves @synflow/core from source for live engine HMR.
      '@synflow/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5174 },
});
