#!/usr/bin/env node
/**
 * build.mjs — le simulateur publié : `dist/server.mjs` (Node), `dist/client.js`
 * (l'hôte, navigateur), `dist/index.html` et `dist/plugin-sandbox.html` (la
 * copie vendorisée, octet pour octet). Le serveur cherche ses fichiers à côté
 * de lui ; depuis les sources, il construit le client à la volée.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(dist, 'server.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external: ['esbuild'],
  logLevel: 'warning',
});
await build({
  entryPoints: [join(root, 'src', 'client', 'main.ts')],
  outfile: join(dist, 'client.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'warning',
});
copyFileSync(join(root, 'src', 'client', 'index.html'), join(dist, 'index.html'));
copyFileSync(join(root, 'vendor', 'plugin-sandbox.html'), join(dist, 'plugin-sandbox.html'));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json')], { stdio: 'inherit' });
console.log('@filarr/extension-devhost : dist/ construit');
