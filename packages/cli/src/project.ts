/**
 * project — le fichier de projet `filarr.extension.json`.
 *
 *   {
 *     "manifest":    { …le manifeste NON SIGNÉ, tel qu'il ira dans le paquet… },
 *     "listing":     { "releaseNotes", "sourceUrl", "license" },
 *     "screenshots": ["captures/1.png", …],          // 4 au plus, PNG/JPEG/WebP
 *     "build":       { "kind": "code", "entry": "src/index.ts" }
 *                  | { "kind": "nocode", "config": "nocode.json" },
 *     "samples":     "exemples"                       // les fichiers du simulateur
 *   }
 *
 * Tous les chemins sont RELATIFS au projet et y restent : un chemin qui en sort
 * (`../`, absolu) est refusé, pour qu'un projet copié d'ailleurs n'aille pas
 * empaqueter un fichier du disque qu'on n'a pas choisi.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ExtensionManifest, PackageListing } from '@filarr/extension-api';
import { scanJson } from '@filarr/nocode-engine';

export const PROJECT_FILE = 'filarr.extension.json';
const MAX_PROJECT_BYTES = 1024 * 1024;

export type ProjectBuild = { kind: 'code'; entry: string } | { kind: 'nocode'; config: string };

export interface Project {
  dir: string;
  file: string;
  /** Le manifeste tel qu'écrit (validé plus loin, par `validateManifest`). */
  manifest: ExtensionManifest;
  listing?: PackageListing;
  screenshots: string[];
  build: ProjectBuild;
  samples: string;
  outDir: string;
}

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Un chemin du projet, résolu, qui ne sort pas du projet. */
export function projectPath(dir: string, rel: string, field: string): string {
  if (typeof rel !== 'string' || rel.trim() === '' || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new ProjectError(`chemin relatif au projet attendu : « ${String(rel)} »`, field);
  }
  const abs = resolve(dir, rel);
  const r = relative(dir, abs);
  if (r === '' || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('..')) {
    throw new ProjectError(`« ${rel} » sort du dossier du projet`, field);
  }
  return abs;
}

/** Lit un fichier JSON borné : taille, imbrication, clés interdites (comme un document). */
export function readJsonFile(path: string, maxBytes: number, label: string): { value: unknown; text: string; bytes: number } {
  if (!existsSync(path)) throw new ProjectError(`${label} introuvable (${path})`);
  const st = statSync(path);
  if (!st.isFile()) throw new ProjectError(`${label} n’est pas un fichier`);
  if (st.size > maxBytes) throw new ProjectError(`${label} dépasse ${Math.round(maxBytes / 1024)} Kio`);
  const raw = readFileSync(path);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^﻿/, '');
  } catch {
    throw new ProjectError(`${label} n’est pas en UTF-8`);
  }
  const scan = scanJson(text);
  if (!scan.ok) throw new ProjectError(`${label} : ${scan.code === 'forbidden_key' ? `clé interdite « ${scan.detail} »` : (scan.detail ?? 'JSON invalide')}`);
  try {
    return { value: JSON.parse(text), text, bytes: raw.byteLength };
  } catch (e) {
    throw new ProjectError(`${label} : JSON invalide (${e instanceof Error ? e.message : ''})`);
  }
}

export function loadProject(dir: string): Project {
  const root = resolve(dir);
  const file = join(root, PROJECT_FILE);
  const { value } = readJsonFile(file, MAX_PROJECT_BYTES, PROJECT_FILE);
  if (!isRecord(value)) throw new ProjectError(`${PROJECT_FILE} doit être un objet`);
  for (const k of Object.keys(value)) {
    if (!['$schema', 'format', 'manifest', 'listing', 'screenshots', 'build', 'samples'].includes(k)) {
      throw new ProjectError(`champ inconnu « ${k} » dans ${PROJECT_FILE}`, k);
    }
  }
  if (value.format !== undefined && value.format !== 1) throw new ProjectError('format de projet inconnu (attendu : 1)', 'format');
  if (!isRecord(value.manifest)) throw new ProjectError('« manifest » manquant', 'manifest');
  if (value.listing !== undefined && !isRecord(value.listing)) throw new ProjectError('« listing » doit être un objet', 'listing');

  const shots = value.screenshots ?? [];
  if (!Array.isArray(shots)) throw new ProjectError('« screenshots » : une liste de chemins', 'screenshots');
  const screenshots = shots.map((s, i) => {
    projectPath(root, s as string, `screenshots[${i}]`);
    return s as string;
  });

  const b = value.build;
  if (!isRecord(b)) throw new ProjectError('« build » manquant : { kind: "code", entry } ou { kind: "nocode", config }', 'build');
  let build: ProjectBuild;
  if (b.kind === 'code') {
    for (const k of Object.keys(b)) if (!['kind', 'entry'].includes(k)) throw new ProjectError(`champ inconnu « build.${k} »`, 'build');
    projectPath(root, b.entry as string, 'build.entry');
    build = { kind: 'code', entry: b.entry as string };
  } else if (b.kind === 'nocode') {
    for (const k of Object.keys(b)) if (!['kind', 'config'].includes(k)) throw new ProjectError(`champ inconnu « build.${k} »`, 'build');
    const config = (b.config as string | undefined) ?? 'nocode.json';
    projectPath(root, config, 'build.config');
    build = { kind: 'nocode', config };
  } else {
    throw new ProjectError('« build.kind » vaut "code" ou "nocode"', 'build.kind');
  }

  const samples = value.samples === undefined ? 'exemples' : (value.samples as string);
  projectPath(root, samples, 'samples');

  return {
    dir: root,
    file,
    manifest: value.manifest as unknown as ExtensionManifest,
    ...(value.listing !== undefined ? { listing: value.listing as PackageListing } : {}),
    screenshots,
    build,
    samples,
    outDir: join(root, 'dist'),
  };
}
