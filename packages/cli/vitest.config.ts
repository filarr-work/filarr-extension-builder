import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@filarr/extension-api': src('../extension-api/src/index.ts'),
      '@filarr/nocode-engine/scripts/engine.mjs': src('../nocode-engine/scripts/engine.mjs'),
      '@filarr/nocode-engine': src('../nocode-engine/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
