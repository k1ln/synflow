import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Dev resolves @synflow/core from source for live engine HMR.
      '@synflow/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5174 },
});
