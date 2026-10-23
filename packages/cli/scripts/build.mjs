#!/usr/bin/env node
/**
 * build.mjs — `dist/cli.mjs`, un seul fichier : l'outil, l'API et le moteur
 * sans code (embarqué en chaîne : la version de l'outil fixe celle du moteur).
 * Restent dehors : esbuild et fflate (dépendances), et le simulateur, qui a
 * ses propres fichiers à servir.
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEngineSource } from '../../nocode-engine/scripts/engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });

const engine = await buildEngineSource();
await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(root, 'dist', 'cli.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  conditions: ['filarr-source'],
  external: ['esbuild', 'fflate', '@filarr/extension-devhost', '@filarr/nocode-engine/scripts/engine.mjs'],
  define: { __FILARR_NOCODE_ENGINE__: JSON.stringify(engine) },
  logLevel: 'warning',
});
console.log('@filarr/extension-cli : dist/cli.mjs construit');
