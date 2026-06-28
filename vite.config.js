import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Dev/build resolve the workspace package from source for live HMR.
      // External consumers use the built dist/ instead.
      '@synflow/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  // The portable-flow export lazily loads the AssemblyScript compiler (to compile
  // AudioWorklets to wasm), which uses top-level await -> needs an es2022 target.
  build: { target: 'es2022' },
  server: {}
});
