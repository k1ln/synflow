import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@synflow/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'packages/core/tests/**/*.test.ts', 'packages/daw/tests/**/*.test.ts'],
  exclude: ['node_modules/**','backend/**']
  }
});
