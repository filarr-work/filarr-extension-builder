/**
 * package — le paquet `.filarrext` (docs/contract/PACKAGE.md, contrat GELÉ le
 * 2026-10-23, format 1).
 *
 * Ce module décrit le format et juge sa DESCRIPTION (`filarr-package.json`) et
 * ses images ; il ne lit pas d'archive (c'est l'affaire de l'outil, qui a
 * `fflate`). Tout ce qui est refusé ici, Filarr le refuserait : un paquet n'a
 * pas de « presque bon ».
 *
 * Le paquet ne contient AUCUNE clé, aucune signature, aucun jeton : la
 * signature se fait dans Filarr, sur l'appareil, après une relecture complète.
 */

import {
  SEMVER_RE,
  validateManifest,
  type ExtensionManifest,
  type Issue,
} from './manifest';

export const PACKAGE_FORMAT = 1;
export const PACKAGE_EXTENSION = '.filarrext';

// ── §1. Le conteneur ────────────────────────────────────────────────────────

export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
export const MAX_ENTRIES = 16;
export const MAX_UNCOMPRESSED_BYTES = 12 * 1024 * 1024;
/** Un niveau de dossier au plus, jamais `..`, jamais de chemin absolu. */
export const ENTRY_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}(\/[a-z0-9][a-z0-9._-]{0,63})?$/;

// ── §2. Les entrées ─────────────────────────────────────────────────────────

export const DESCRIPTION_ENTRY = 'filarr-package.json';
export const BUNDLE_ENTRY = 'bundle.js';
export const NOCODE_ENTRY = 'nocode.json';
export const SCREENSHOT_ENTRIES = [
  'screenshots/1.webp',
  'screenshots/2.webp',
  'screenshots/3.webp',
  'screenshots/4.webp',
] as const;

export const MAX_DESCRIPTION_BYTES = 64 * 1024;
export const MIN_BUNDLE_BYTES = 1;
export const MAX_PACKAGE_BUNDLE_BYTES = 4 * 1024 * 1024;
export const MAX_NOCODE_BYTES = 256 * 1024;
export const MAX_SCREENSHOT_BYTES = 96 * 1024;
export const MAX_SCREENSHOTS = 4;

/**
 * Toutes les entrées qu'un paquet peut porter ; une autre est REFUSÉE.
 *
 * Aucune image d'icône : l'icône d'une extension est l'emoji `manifest.icon`
 * (PUBLISHING.md §2). Une entrée `icon.png` ou `icon.webp` est refusée comme
 * toute entrée inconnue (PACKAGE.md, correction du 2026-10-23).
 */
export const KNOWN_ENTRIES: readonly string[] = [DESCRIPTION_ENTRY, BUNDLE_ENTRY, NOCODE_ENTRY, ...SCREENSHOT_ENTRIES];

// ── §3. La description ──────────────────────────────────────────────────────

export const MAX_RELEASE_NOTES = 2000;
export const MAX_SOURCE_URL = 300;
export const MAX_LICENSE = 40;
export const MAX_TOOL = 60;

export interface PackageListing {
  releaseNotes?: string;
  sourceUrl?: string;
  license?: string;
}

export type PackageBuild =
  | { kind: 'code'; tool: string }
  | { kind: 'nocode'; tool: string; engine: string };

export interface PackageDescription {
  format: 1;
  manifest: ExtensionManifest;
  listing?: PackageListing;
  screenshots?: string[];
  build: PackageBuild;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `listing` — tout est optionnel, texte brut. */
export function validateListing(raw: unknown, prefix = 'listing'): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, code: string, message: string) =>
    issues.push({ level: 'error', code, field: `${prefix}${field ? `.${field}` : ''}`, message });
  if (raw === undefined) return issues;
  if (!isRecord(raw)) {
    err('', 'bad_listing', '`listing` doit être un objet');
    return issues;
  }
  for (const cle of Object.keys(raw)) {
    if (!['releaseNotes', 'sourceUrl', 'license'].includes(cle)) {
      err(cle, 'unknown_field', `champ inconnu « ${cle} » (releaseNotes, sourceUrl, license)`);
    }
  }
  if (raw.releaseNotes !== undefined) {
    if (typeof raw.releaseNotes !== 'string' || raw.releaseNotes.length > MAX_RELEASE_NOTES) {
      err('releaseNotes', 'bad_release_notes', `notes de version : texte de ${MAX_RELEASE_NOTES} caractères au plus`);
    }
  }
  if (raw.sourceUrl !== undefined) {
    let ok = typeof raw.sourceUrl === 'string' && raw.sourceUrl.startsWith('https://') && raw.sourceUrl.length <= MAX_SOURCE_URL;
    if (ok) {
      try {
        new URL(raw.sourceUrl as string);
      } catch {
        ok = false;
      }
    }
    if (!ok) err('sourceUrl', 'bad_source_url', `adresse des sources : https://…, ${MAX_SOURCE_URL} caractères au plus`);
  }
  if (raw.license !== undefined) {
    if (typeof raw.license !== 'string' || raw.license.length > MAX_LICENSE || raw.license.trim() === '') {
      err('license', 'bad_license', `licence : texte de 1 à ${MAX_LICENSE} caractères`);
    }
  }
  return issues;
}

/** `build` — DÉCLARATIF : Filarr l'affiche comme « déclaré par l'outil », il ne prouve rien. */
export function validateBuildDeclaration(raw: unknown): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, code: string, message: string) =>
    issues.push({ level: 'error', code, field: `build${field ? `.${field}` : ''}`, message });
  if (!isRecord(raw)) {
    err('', 'bad_build', '`build` doit être un objet { kind, tool, engine? }');
    return issues;
  }
  for (const cle of Object.keys(raw)) {
    if (!['kind', 'tool', 'engine'].includes(cle)) err(cle, 'unknown_field', `champ inconnu « ${cle} »`);
  }
  if (raw.kind !== 'code' && raw.kind !== 'nocode') err('kind', 'bad_kind', '`kind` vaut "code" ou "nocode"');
  if (typeof raw.tool !== 'string' || raw.tool.length < 1 || raw.tool.length > MAX_TOOL) {
    err('tool', 'bad_tool', `\`tool\` : 1 à ${MAX_TOOL} caractères`);
  }
  if (raw.kind === 'nocode') {
    if (typeof raw.engine !== 'string' || !SEMVER_RE.test(raw.engine)) {
      err('engine', 'bad_engine', '`engine` (semver) est requis en sans code');
    }
  } else if (raw.engine !== undefined) {
    err('engine', 'bad_engine', '`engine` n’existe qu’en sans code');
  }
  return issues;
}

/**
 * Juge `filarr-package.json` déjà analysé. `byteLength` : sa taille en octets
 * UTF-8, quand on l'a (64 Kio au plus).
 */
export function validatePackageDescription(
  raw: unknown,
  byteLength?: number
): { ok: boolean; issues: Issue[]; description?: PackageDescription } {
  const issues: Issue[] = [];
  const err = (field: string, code: string, message: string) =>
    issues.push({ level: 'error', code, field, message });

  if (byteLength !== undefined && byteLength > MAX_DESCRIPTION_BYTES) {
    err(DESCRIPTION_ENTRY, 'description_too_large', `${DESCRIPTION_ENTRY} dépasse 64 Kio (${byteLength} octets)`);
  }
  if (!isRecord(raw)) {
    err(DESCRIPTION_ENTRY, 'not_object', `${DESCRIPTION_ENTRY} doit être un objet JSON`);
    return { ok: false, issues };
  }
  for (const cle of Object.keys(raw)) {
    if (!['format', 'manifest', 'listing', 'screenshots', 'build'].includes(cle)) {
      err(cle, 'unknown_field', `champ inconnu « ${cle} » dans ${DESCRIPTION_ENTRY}`);
    }
  }
  if (raw.format !== PACKAGE_FORMAT) {
    err('format', 'bad_format', `format ${String(raw.format)} inconnu : ce paquet attend le format ${PACKAGE_FORMAT}`);
  }
  issues.push(...validateManifest(raw.manifest).issues);
  issues.push(...validateListing(raw.listing));
  if (raw.screenshots !== undefined) {
    const s = raw.screenshots;
    if (
      !Array.isArray(s) ||
      s.length > MAX_SCREENSHOTS ||
      !s.every((n) => typeof n === 'string' && (SCREENSHOT_ENTRIES as readonly string[]).includes(n)) ||
      new Set(s).size !== s.length
    ) {
      err('screenshots', 'bad_screenshots', `captures : 4 au plus, parmi ${SCREENSHOT_ENTRIES.join(', ')}, sans doublon`);
    }
  }
  issues.push(...validateBuildDeclaration(raw.build));
  const ok = !issues.some((i) => i.level === 'error');
  return ok ? { ok, issues, description: raw as unknown as PackageDescription } : { ok, issues };
}

// ── Les images, lues par leurs OCTETS ───────────────────────────────────────

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  /** `null` quand l'en-tête ne permet pas de les lire (fichier tronqué). */
  width: number | null;
  height: number | null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    // Les SOF portent la taille ; C4 (DHT), C8 (JPG) et CC (DAC) n'en sont pas.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Le type et la taille d'une image, lus dans ses octets — jamais dans ce que
 * dit son nom. `null` : ni PNG, ni JPEG, ni WebP (donc refusée : pas de SVG,
 * qui est un document capable de porter des scripts).
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    const ok = b.length >= 24 && String.fromCharCode(b[12], b[13], b[14], b[15]) === 'IHDR';
    return { mime: 'image/png', width: ok ? u32be(b, 16) : null, height: ok ? u32be(b, 20) : null };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b);
    return { mime: 'image/jpeg', width: size?.width ?? null, height: size?.height ?? null };
  }
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  ) {
    const chunk = b.length >= 16 ? String.fromCharCode(b[12], b[13], b[14], b[15]) : '';
    if (chunk === 'VP8 ' && b.length >= 30) {
      // VP8 avec perte : la taille suit le code de départ 9D 01 2A, en petit-boutiste sur 14 bits.
      return { mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    }
    if (chunk === 'VP8L' && b.length >= 25) {
      const width = 1 + (b[21] | ((b[22] & 0x3f) << 8));
      const height = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
      return { mime: 'image/webp', width, height };
    }
    if (chunk === 'VP8X' && b.length >= 30) {
      return { mime: 'image/webp', width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
    }
    return { mime: 'image/webp', width: null, height: null };
  }
  return null;
}
