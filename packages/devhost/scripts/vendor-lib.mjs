/**
 * vendor-lib — recopier À L'IDENTIQUE des fichiers du dépôt Filarr (`filarg`)
 * et prouver qu'ils n'ont pas dérivé.
 *
 * POURQUOI DES COPIES ET PAS UNE DÉPENDANCE. Le dépôt de l'application n'est
 * pas publié : un auteur d'extension qui installe le Builder ne l'a pas. Mais
 * deux validateurs qui s'écartent d'un plafond, c'est une extension ACCEPTÉE
 * par `filarr-ext check` puis REFUSÉE par Filarr, sans que rien ne dise
 * pourquoi. D'où la règle : on copie, octet pour octet, et on vérifie.
 *
 * Deux vérifications, de force différente :
 *  · TOUJOURS : le corps de chaque copie a l'empreinte SHA-256 notée dans
 *    `vendor.json` — une retouche locale se voit, même sans `filarg` ;
 *  · quand `filarg` est là (`FILARG_DIR`, sinon le dossier voisin du dépôt) :
 *    le corps est identique à la source — une évolution de Filarr se voit.
 *
 * Les fins de ligne sont ramenées à LF avant toute comparaison : git sous
 * Windows (`core.autocrlf`) les réécrit à l'extraction, et ce n'est pas une
 * dérive du contrat.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const HEADER_END = "─── fin de l'en-tête vendorisé";

export function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** L'en-tête posé devant une copie TypeScript : il cite la source, rien d'autre. */
export function tsHeader(from) {
  return [
    '/*',
    ' * ─── COPIE VENDORISÉE — ne pas modifier à la main ──────────────────────────',
    ` * Source : filarg/${from}`,
    " * Recopiée à l'identique par `npm run sync` ; `test/vendor.test.ts` échoue",
    " * dès qu'elle s'écarte de la source, ou de l'empreinte notée dans vendor.json.",
    ` * ${HEADER_END} ─────────────────────────────────────────────`,
    ' */',
    '',
  ].join('\n');
}

/** Le corps d'une copie : ce qui suit l'en-tête (ou tout, pour un fichier sans en-tête). */
export function vendoredBody(text, header) {
  const lf = normalizeEol(text);
  if (header !== 'ts') return lf;
  const i = lf.indexOf(HEADER_END);
  if (i < 0) return null;
  const fin = lf.indexOf(' */\n', i);
  if (fin < 0) return null;
  return lf.slice(fin + ' */\n'.length);
}

/** Le dossier de `filarg`, s'il est là. */
export function findFilarg(packageDir) {
  const candidats = [process.env.FILARG_DIR, resolve(packageDir, '..', '..', '..', 'filarg')];
  for (const c of candidats) {
    if (c && existsSync(join(c, 'public', 'plugin-sandbox.html'))) return c;
  }
  return null;
}

export function readVendorManifest(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, 'vendor.json'), 'utf8'));
}

/**
 * L'état de chaque copie. `source` vaut `null` quand `filarg` est absent : on
 * ne sait alors dire que « conforme à l'empreinte » ou non.
 */
export function inspectVendor(packageDir) {
  const manifest = readVendorManifest(packageDir);
  const filarg = findFilarg(packageDir);
  return manifest.files.map((f) => {
    const copiePath = join(packageDir, f.to);
    const copie = existsSync(copiePath) ? readFileSync(copiePath, 'utf8') : null;
    const corps = copie === null ? null : vendoredBody(copie, f.header);
    let source = null;
    if (filarg) {
      const sourcePath = join(filarg, f.from);
      source = existsSync(sourcePath) ? normalizeEol(readFileSync(sourcePath, 'utf8')) : null;
    }
    return {
      ...f,
      filarg,
      present: corps !== null,
      matchesHash: corps !== null && sha256(corps) === f.sha256,
      matchesSource: source === null ? null : corps === source,
      sourceMissing: filarg !== null && source === null,
    };
  });
}

/** Recopie chaque source et met à jour les empreintes. Rend la liste des fichiers changés. */
export function syncVendor(packageDir) {
  const filarg = findFilarg(packageDir);
  if (!filarg) {
    throw new Error(
      "dépôt filarg introuvable : posez FILARG_DIR ou placez-le à côté de filarr-extension-builder"
    );
  }
  const manifest = readVendorManifest(packageDir);
  const changes = [];
  for (const f of manifest.files) {
    const source = normalizeEol(readFileSync(join(filarg, f.from), 'utf8'));
    const contenu = f.header === 'ts' ? tsHeader(f.from) + source : source;
    const cible = join(packageDir, f.to);
    const avant = existsSync(cible) ? normalizeEol(readFileSync(cible, 'utf8')) : null;
    if (avant !== contenu) {
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, contenu);
      changes.push(f.to);
    }
    f.sha256 = sha256(source);
  }
  writeFileSync(join(packageDir, 'vendor.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return changes;
}
