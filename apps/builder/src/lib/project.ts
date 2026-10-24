/**
 * project — un projet du Builder : une carte chemin → octets, avec la MÊME
 * arborescence qu'un projet `create-filarr-extension`.
 *
 *   filarr.extension.json   manifeste non signé, fiche, captures, construction
 *   nocode.json             (sans code) la configuration du moteur
 *   src/…                   (avec code) les sources
 *   exemples/…              les fichiers que le simulateur ouvre
 *   captures/…              les captures de la fiche (WebP, réencodées ici)
 *   .filarr-builder.json    ce que seul le Builder retient (voir BuilderMeta)
 *
 * Rien d'autre n'est caché ailleurs : exporter le .zip, c'est exporter tout le
 * projet, et le même dossier passe `filarr-ext check` sans le Builder.
 *
 * La lecture de `filarr.extension.json` rejoue les règles de `loadProject`
 * (packages/cli/src/project.ts) sans système de fichiers : mêmes champs
 * permis, mêmes chemins refusés (`..`, absolus).
 */

import { scanJson } from '@filarr/nocode-engine';
import type { ExtensionManifest, PackageListing } from '@filarr/extension-api';
import { strictText, utf8 } from './bytes';

export type FileMap = Record<string, Uint8Array>;

export const PROJECT_FILE = 'filarr.extension.json';
export const BUILDER_FILE = '.filarr-builder.json';
const MAX_PROJECT_BYTES = 1024 * 1024;

export type ProjectBuild = { kind: 'code'; entry: string } | { kind: 'nocode'; config: string };

/** `filarr.extension.json`, lu et vérifié. */
export interface ProjectDescriptor {
  manifest: ExtensionManifest;
  listing?: PackageListing;
  screenshots: string[];
  build: ProjectBuild;
  samples: string;
  /** Le JSON brut (on le réécrit en gardant les champs qu'on ne touche pas). */
  raw: Record<string, unknown>;
}

/**
 * Ce que seul le Builder retient, dans `.filarr-builder.json` — jamais dans le
 * paquet. `required` : les champs que vous déclarez obligatoires (le moteur
 * n'impose rien ; le Builder vérifie que vos exemples les portent).
 * `lastPublished` : la dernière version publiée, que la suivante doit dépasser.
 */
export interface BuilderMeta {
  builder: 1;
  required?: Record<string, boolean>;
  lastPublished?: string;
  template?: string;
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

/**
 * Un chemin relatif au projet, normalisé en `a/b/c`. Refuse ce que refuse
 * `projectPath` de l'outil : absolu, lecteur Windows, `..`, vide.
 */
export function normalizePath(rel: string): string | null {
  if (typeof rel !== 'string') return null;
  const p = rel.replace(/\\/g, '/').trim();
  if (p === '' || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\0')) return null;
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

export function readText(files: FileMap, path: string): string | null {
  const b = files[path];
  return b ? strictText(b) : null;
}

/** Lit un JSON du projet comme l'outil : UTF-8 strict, marque d'ordre ôtée, clés interdites refusées. */
export function readJson(files: FileMap, path: string, maxBytes: number): unknown {
  const b = files[path];
  if (!b) throw new ProjectError(`${path} introuvable`, path);
  if (b.byteLength > maxBytes) throw new ProjectError(`${path} dépasse ${Math.round(maxBytes / 1024)} Kio`, path);
  const raw = strictText(b);
  if (raw === null) throw new ProjectError(`${path} n’est pas en UTF-8`, path);
  const t = raw.replace(/^﻿/, '');
  const scan = scanJson(t);
  if (!scan.ok) throw new ProjectError(`${path} : ${scan.code === 'forbidden_key' ? `clé interdite « ${scan.detail} »` : (scan.detail ?? 'JSON invalide')}`, path);
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new ProjectError(`${path} : JSON invalide (${e instanceof Error ? e.message : ''})`, path);
  }
}

function checkRel(rel: unknown, field: string): string {
  const n = typeof rel === 'string' ? normalizePath(rel) : null;
  if (!n) throw new ProjectError(`chemin relatif au projet attendu : « ${String(rel)} »`, field);
  return n;
}

/** `filarr.extension.json` → descripteur. Jette `ProjectError`, comme `loadProject`. */
export function parseProject(files: FileMap): ProjectDescriptor {
  const value = readJson(files, PROJECT_FILE, MAX_PROJECT_BYTES);
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
  const screenshots = shots.map((s, i) => checkRel(s, `screenshots[${i}]`));
  const b = value.build;
  if (!isRecord(b)) throw new ProjectError('« build » manquant : { kind: "code", entry } ou { kind: "nocode", config }', 'build');
  let build: ProjectBuild;
  if (b.kind === 'code') {
    for (const k of Object.keys(b)) if (!['kind', 'entry'].includes(k)) throw new ProjectError(`champ inconnu « build.${k} »`, 'build');
    build = { kind: 'code', entry: checkRel(b.entry, 'build.entry') };
  } else if (b.kind === 'nocode') {
    for (const k of Object.keys(b)) if (!['kind', 'config'].includes(k)) throw new ProjectError(`champ inconnu « build.${k} »`, 'build');
    build = { kind: 'nocode', config: checkRel(b.config ?? 'nocode.json', 'build.config') };
  } else {
    throw new ProjectError('« build.kind » vaut "code" ou "nocode"', 'build.kind');
  }
  const samples = value.samples === undefined ? 'exemples' : checkRel(value.samples, 'samples');
  return {
    manifest: value.manifest as unknown as ExtensionManifest,
    ...(value.listing !== undefined ? { listing: value.listing as PackageListing } : {}),
    screenshots,
    build,
    samples,
    raw: value,
  };
}

export function tryParseProject(files: FileMap): { ok: true; project: ProjectDescriptor } | { ok: false; error: ProjectError } {
  try {
    return { ok: true, project: parseProject(files) };
  } catch (e) {
    return { ok: false, error: e instanceof ProjectError ? e : new ProjectError(String(e)) };
  }
}

export function jsonFile(value: unknown): Uint8Array {
  return utf8(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Réécrit `filarr.extension.json` par une fonction sur son JSON brut. L'ordre
 * des clés est gardé : le fichier reste lisible dans un diff.
 */
export function updateProjectJson(files: FileMap, mutate: (raw: Record<string, unknown>) => void): FileMap {
  const raw = structuredClone(parseProject(files).raw);
  mutate(raw);
  return { ...files, [PROJECT_FILE]: jsonFile(raw) };
}

export function readMeta(files: FileMap): BuilderMeta {
  try {
    const v = readJson(files, BUILDER_FILE, 256 * 1024);
    if (isRecord(v) && v.builder === 1) return v as unknown as BuilderMeta;
  } catch {
    /* absent ou illisible : valeurs par défaut */
  }
  return { builder: 1 };
}

export function writeMeta(files: FileMap, meta: BuilderMeta): FileMap {
  return { ...files, [BUILDER_FILE]: jsonFile(meta) };
}

/** Les fichiers d'exemple (le dossier `samples`, un niveau, sans fichiers cachés). */
export function sampleFiles(files: FileMap, samplesDir = 'exemples'): { name: string; path: string; size: number }[] {
  const prefix = `${samplesDir}/`;
  return Object.keys(files)
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/') && !p.slice(prefix.length).startsWith('.'))
    .sort()
    .map((p) => ({ name: p.slice(prefix.length), path: p, size: files[p].byteLength }));
}

/** Le nom de fichier du paquet, comme `filarr-ext pack` : `<id>-<version>.filarrext`. */
export function packageFileName(m: { id?: unknown; version?: unknown }): string {
  return `${String(m.id ?? 'extension')}-${String(m.version ?? '0.0.0')}.filarrext`;
}

/** Une version a.b.c strictement supérieure à une autre. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x));
  const pb = b.split('.').map((x) => Number(x));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function bumpVersion(v: string, kind: 'patch' | 'minor' | 'major'): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return '0.1.0';
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** Le slug d'un nom, comme `create-filarr-extension`. */
export function slugify(name: string): string {
  const s = String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const withLetter = /^[a-z]/.test(s) ? s : `ext-${s}`;
  return withLetter.length >= 2 ? withLetter.slice(0, 64).replace(/-+$/, '') : 'mon-extension';
}
