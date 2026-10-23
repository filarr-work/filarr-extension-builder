#!/usr/bin/env node
/**
 * build.mjs — trois sorties :
 *  · `dist/engine.js` : le moteur seul (ce qui précède les deux lignes finales
 *    de chaque bundle sans code) ;
 *  · `dist/index.mjs` : l'API de l'outil, le moteur embarqué en chaîne ;
 *  · les déclarations TypeScript.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildEngineSource, packageDir } from './engine.mjs';

const dist = join(packageDir, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const engine = await buildEngineSource();
writeFileSync(join(dist, 'engine.js'), engine);

await build({
  entryPoints: [join(packageDir, 'src', 'index.ts')],
  outfile: join(dist, 'index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  conditions: ['filarr-source'],
  // L'API de l'outil porte sa propre copie d'@filarr/extension-api : un seul fichier à charger.
  define: { __FILARR_NOCODE_ENGINE__: JSON.stringify(engine) },
  logLevel: 'warning',
});

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(packageDir, 'tsconfig.build.json')], { stdio: 'inherit' });
console.log(`@filarr/nocode-engine : dist/ construit (moteur ${(engine.length / 1024).toFixed(1)} Kio)`);
