/**
 * zip — exporter et importer un PROJET (pas un paquet) : la même arborescence
 * qu'un projet `create-filarr-extension`, sous un dossier `<id>/`.
 *
 * Un .zip importé vient peut-être d'un inconnu (revue de sécurité, point 10) :
 * on le traite comme une donnée hostile. Taille bornée avant tout, noms
 * vérifiés (ni `..`, ni chemin absolu, ni lecteur Windows), tailles annoncées
 * bornées SANS décompresser, puis décompression entrée par entrée, coupée au
 * moindre dépassement. Rien de ce qu'il contient n'est exécuté dans l'atelier :
 * son code ne tourne que dans la page bac à sable du simulateur.
 */

import { strToU8, Unzip, UnzipInflate, unzipSync, zipSync, type Zippable } from 'fflate';
import { normalizePath, PROJECT_FILE, tryParseProject, type FileMap } from './project';

export const MAX_PROJECT_ZIP = 32 * 1024 * 1024;
export const MAX_PROJECT_FILES = 1000;
export const MAX_PROJECT_UNCOMPRESSED = 64 * 1024 * 1024;
const FIXED_MTIME = new Date(2026, 0, 1, 0, 0, 0);
/** Ce qu'on ne reprend jamais d'un .zip : dépendances, sorties, dépôts. */
const SKIP = /(^|\/)(node_modules|dist|\.git|\.DS_Store|__MACOSX)(\/|$)/;

export function exportProjectZip(files: FileMap, root: string): Uint8Array {
  const z: Zippable = {};
  for (const [p, b] of Object.entries(files).sort(([a], [c]) => a.localeCompare(c))) {
    const img = /\.(png|webp|jpe?g|gif)$/i.test(p);
    z[`${root}/${p}`] = [b, { level: img ? 0 : 6, mtime: FIXED_MTIME }];
  }
  return zipSync(z);
}

export class ImportError extends Error {}

/** Lit un projet depuis un .zip ; jette `ImportError` avec une phrase lisible. */
export function importProjectZip(data: Uint8Array): { files: FileMap; skipped: string[] } {
  if (data.byteLength > MAX_PROJECT_ZIP) throw new ImportError(`archive de plus de ${MAX_PROJECT_ZIP / 1024 / 1024} Mio`);
  // 1. Le répertoire central, sans rien décompresser.
  const listing: { name: string; size: number }[] = [];
  try {
    unzipSync(data, {
      filter: (f) => {
        listing.push({ name: f.name, size: f.originalSize });
        return false;
      },
    });
  } catch (e) {
    throw new ImportError(`archive ZIP illisible (${e instanceof Error ? e.message : String(e)})`);
  }
  const entries = listing.filter((f) => !f.name.endsWith('/'));
  if (entries.length > MAX_PROJECT_FILES) throw new ImportError(`${entries.length} fichiers : ${MAX_PROJECT_FILES} au plus`);
  const announced = entries.reduce((n, f) => n + f.size, 0);
  if (announced > MAX_PROJECT_UNCOMPRESSED) throw new ImportError('plus de 64 Mio une fois décompressée');
  const skipped: string[] = [];
  for (const f of entries) {
    if (normalizePath(f.name) === null) throw new ImportError(`nom de fichier refusé dans l’archive : « ${f.name.slice(0, 80)} »`);
  }
  // 2. Le dossier racine éventuel (un zip de « mon-extension/… »).
  const names = entries.map((f) => normalizePath(f.name) as string).filter((n) => !SKIP.test(n));
  const projectFile = names.filter((n) => n === PROJECT_FILE || n.endsWith(`/${PROJECT_FILE}`)).sort((a, b) => a.length - b.length)[0];
  if (!projectFile) throw new ImportError(`aucun ${PROJECT_FILE} dans l’archive : est-ce bien un projet d’extension ?`);
  const root = projectFile.slice(0, projectFile.length - PROJECT_FILE.length);
  // 3. La décompression, entrée par entrée, bornée par ce qui a été annoncé ET par le total.
  let total = 0;
  const wanted = new Set(entries.map((f) => f.name).filter((n) => {
    const norm = normalizePath(n) as string;
    if (SKIP.test(norm) || !norm.startsWith(root)) {
      skipped.push(norm);
      return false;
    }
    return true;
  }));
  // Décompression EN FLUX : chaque entrée est coupée dès qu'elle dépasse sa taille annoncée.
  const declared = new Map(entries.map((f) => [f.name, f.size]));
  const files: FileMap = {};
  let failure: string | null = null;
  const uz = new Unzip();
  uz.register(UnzipInflate);
  uz.onfile = (file) => {
    if (!wanted.has(file.name)) return;
    const cap = declared.get(file.name) ?? 0;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = err.message;
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > cap || total > MAX_PROJECT_UNCOMPRESSED) {
        failure = 'une entrée dépasse la taille annoncée (bombe de décompression)';
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const bytes = new Uint8Array(size);
        let o = 0;
        for (const c of chunks) {
          bytes.set(c, o);
          o += c.length;
        }
        const rel = (normalizePath(file.name) as string).slice(root.length);
        if (rel) files[rel] = bytes;
      }
    };
    file.start();
  };
  try {
    uz.push(data, true);
  } catch (e) {
    failure ??= e instanceof Error ? e.message : String(e);
  }
  if (failure) throw new ImportError(`archive refusée : ${failure}`);
  const parsed = tryParseProject(files);
  if (!parsed.ok) throw new ImportError(`${PROJECT_FILE} refusé : ${parsed.error.message}`);
  return { files, skipped };
}

/** Un petit .zip de démonstration (tests). */
export function zipOf(entries: Record<string, string | Uint8Array>): Uint8Array {
  const z: Zippable = {};
  for (const [k, v] of Object.entries(entries)) z[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(z);
}
