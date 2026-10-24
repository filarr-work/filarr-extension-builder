/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { filarrPlugin } from './vite/filarrPlugin';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), filarrPlugin()],
  resolve: {
    alias: [
      // Les paquets du dépôt, lus depuis leurs sources : l'atelier fait EXACTEMENT ce que fait l'outil.
      { find: /^@filarr\/extension-api$/, replacement: here('../../packages/extension-api/src/index.ts') },
      { find: /^@filarr\/nocode-engine$/, replacement: here('../../packages/nocode-engine/src/index.ts') },
      // Les contrôles, l'empaquetage et la relecture de `filarr-ext` (packages/cli/src).
      { find: /^@filarr-cli\/(.*)$/, replacement: here('../../packages/cli/src/$1') },
      // L'hôte navigateur du simulateur (packages/devhost/src/client et son pont vendorisé).
      { find: /^@filarr-devhost\/(.*)$/, replacement: here('../../packages/devhost/src/$1') },
      { find: /^@filarr-create\/(.*)$/, replacement: here('../../packages/create-filarr-extension/src/$1') },
      // `checks.ts` importe `node:vm` pour l'exécution à blanc, que l'atelier ne fait jamais. Sous
      // vitest, les tests comparent l'atelier au VRAI `filarr-ext check`, qui en a besoin.
      ...(process.env.VITEST ? [] : [{ find: 'node:vm', replacement: here('./src/lib/shims/vm.ts') }]),
    ],
  },
  server: {
    // Filarr n'accepte « Ouvrir dans Filarr » d'un Builder de développement que depuis ce port (PACKAGE.md §5).
    port: 5173,
    strictPort: true,
    // « localhost » et non 127.0.0.1 : c'est l'origine que Filarr de développement admet.
    host: 'localhost',
    fs: { allow: [here('../..')] },
  },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 4096,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
