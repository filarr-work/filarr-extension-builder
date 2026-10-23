#!/usr/bin/env node
/**
 * Le binaire `filarr-ext`. Charge `dist/cli.mjs` ; dans le dépôt du Builder,
 * si l'outil n'a pas encore été construit, il se construit d'abord (une fois).
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/cli.mjs', import.meta.url);
if (!existsSync(dist)) {
  const script = new URL('../scripts/build.mjs', import.meta.url);
  if (!existsSync(script)) {
    console.error('filarr-ext : dist/cli.mjs manquant — réinstallez @filarr/extension-cli');
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [fileURLToPath(script)], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0 || !existsSync(dist)) {
    console.error('filarr-ext : la construction de l’outil a échoué (npm run build -w @filarr/extension-cli)');
    process.exit(2);
  }
}
const { main } = await import(dist.href);
process.exitCode = await main(process.argv.slice(2));
