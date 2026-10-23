#!/usr/bin/env node
/**
 * build.mjs — `dist/index.mjs` (ESM, sans dépendance, navigateur comme Node)
 * et les déclarations TypeScript, pour qui installe le paquet depuis npm.
 * Dans le dépôt, les autres paquets lisent directement `src/` (condition
 * `filarr-source`) : rien n'attend ce build pour être testé.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'dist'), { recursive: true, force: true });

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(root, 'dist', 'index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  logLevel: 'warning',
});

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json')], { stdio: 'inherit' });
console.log('@filarr/extension-api : dist/ construit');
