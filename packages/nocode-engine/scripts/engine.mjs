/**
 * engine.mjs — construire le MOTEUR tel qu'il voyage dans chaque bundle sans
 * code : une IIFE ES2020, minifiée, en ASCII, sans commentaire.
 *
 * Partagé par le build du paquet, par celui de `filarr-ext` (qui l'embarque)
 * et par les tests (qui le construisent en mémoire, sans rien écrire).
 */
import { build, buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function engineVersion() {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version;
}

function options() {
  return {
    entryPoints: [join(packageDir, 'src', 'boot.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    charset: 'ascii',
    legalComments: 'none',
    conditions: ['filarr-source'],
    write: false,
    logLevel: 'silent',
  };
}

export async function buildEngineSource() {
  const r = await build(options());
  return r.outputFiles[0].text;
}

export function buildEngineSourceSync() {
  return buildSync(options()).outputFiles[0].text;
}
