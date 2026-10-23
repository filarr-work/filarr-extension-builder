import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Le projet créé est contrôlé par le VRAI `filarr-ext check`, lu depuis ses sources.
  resolve: {
    alias: {
      '@filarr/extension-api': src('../extension-api/src/index.ts'),
      '@filarr/nocode-engine/scripts/engine.mjs': src('../nocode-engine/scripts/engine.mjs'),
      '@filarr/nocode-engine': src('../nocode-engine/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
