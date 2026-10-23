#!/usr/bin/env node
/**
 * `npm run sync` — recopie depuis `filarg` les fichiers listés dans
 * `vendor.json` (voir vendor-lib.mjs). `--check` ne recopie rien : il dit
 * seulement si les copies ont dérivé, et sort en erreur le cas échéant.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectVendor, syncVendor } from './vendor-lib.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--check')) {
  let derive = false;
  for (const f of inspectVendor(packageDir)) {
    const etat = !f.present
      ? 'absente'
      : !f.matchesHash
        ? 'retouchée (empreinte)'
        : f.matchesSource === false
          ? 'dérivée de filarg'
          : f.matchesSource === null
            ? 'conforme à l’empreinte (filarg absent)'
            : 'identique à filarg';
    const mauvais = !f.present || !f.matchesHash || f.matchesSource === false;
    if (mauvais) derive = true;
    console.log(`${mauvais ? '✗' : '✓'} ${f.to} — ${etat}`);
  }
  process.exit(derive ? 1 : 0);
}

const changes = syncVendor(packageDir);
console.log(changes.length ? `Recopié : ${changes.join(', ')}` : 'Copies déjà à jour.');
