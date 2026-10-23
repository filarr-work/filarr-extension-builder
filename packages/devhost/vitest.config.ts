import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Les tests d'intégration montent un vrai bundle sans code dans la vraie page bac à sable.
  resolve: {
    alias: {
      '@filarr/extension-api': src('../extension-api/src/index.ts'),
      '@filarr/nocode-engine': src('../nocode-engine/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/engine.setup.ts'],
    testTimeout: 30_000,
  },
});
