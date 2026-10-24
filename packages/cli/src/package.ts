/**
 * package — écrire et relire le paquet `.filarrext` (PACKAGE.md, format 1).
 *
 * `pack` n'écrit un paquet qu'après l'avoir RELU par le même chemin que
 * `verify` : un paquet que Filarr refuserait n'arrive jamais sur le disque.
 *
 * La relecture se méfie de l'archive comme Filarr : taille bornée AVANT tout,
 * répertoire central lu sans rien décompresser (noms, nombre, méthodes, tailles
 * annoncées), puis décompression en flux, entrée par entrée, COUPÉE dès qu'une
 * entrée dépasse sa borne ou que le total dépasse 12 Mio — une taille annoncée
 * peut mentir, une bombe de décompression ne passe pas.
 */

import { Unzip, UnzipInflate, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  BUNDLE_ENTRY,
  DESCRIPTION_ENTRY,
  ENTRY_NAME_RE,
  KNOWN_ENTRIES,
  MAX_ARCHIVE_BYTES,
  MAX_DESCRIPTION_BYTES,
  MAX_ENTRIES,
  MAX_NOCODE_BYTES,
  MAX_PACKAGE_BUNDLE_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  NOCODE_ENTRY,
  PACKAGE_FORMAT,
  SCREENSHOT_ENTRIES,
  validatePackageDescription,
  type PackageDescription,
} from '@filarr/extension-api';
import {
  checkNocodeAgainstManifest,
  ENGINE_VERSION,
  parseNocodeConfigFromBundle,
  scanJson,
  serializeNocodeConfig,
  validateConfig,
} from '@filarr/nocode-engine';
import { checkBundleShape, checkEntryPoints, scanApis, type CompileCheck } from './checks';
import type { CheckResult } from './check';
import { checkScreenshot } from './images';
import { formatBytes, Report } from './report';

const ENC = new TextEncoder();
/** Une date fixe : deux `pack` du même projet donnent la même archive. */
const FIXED_MTIME = new Date(2026, 0, 1, 0, 0, 0);

function entryCap(name: string): number {
  if (name === DESCRIPTION_ENTRY) return MAX_DESCRIPTION_BYTES;
  if (name === BUNDLE_ENTRY) return MAX_PACKAGE_BUNDLE_BYTES;
  if (name === NOCODE_ENTRY) return MAX_NOCODE_BYTES;
  if ((SCREENSHOT_ENTRIES as readonly string[]).includes(name)) return MAX_SCREENSHOT_BYTES;
  return 0;
}

export interface ReadPackage {
  entries: Map<string, Uint8Array>;
}

/** Relit l'archive sous toutes ses bornes. `null` : refusée (les raisons sont dans le rapport). */
export function readArchive(data: Uint8Array, report: Report): ReadPackage | null {
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    report.error('archive_too_large', `archive de ${formatBytes(data.byteLength)} : 8 Mio au plus`);
    return null;
  }
  // 1. Le répertoire central, sans rien décompresser.
  const listing: { name: string; size: number; originalSize: number; compression: number }[] = [];
  try {
    unzipSync(data, {
      filter: (f) => {
        listing.push({ name: f.name, size: f.size, originalSize: f.originalSize, compression: f.compression });
        return false;
      },
    });
  } catch (e) {
    report.error('archive_unreadable', `archive ZIP illisible : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  let ok = true;
  if (listing.length > MAX_ENTRIES) {
    report.error('archive_entries', `${listing.length} entrées : 16 au plus`);
    ok = false;
  }
  const vus = new Set<string>();
  let annonce = 0;
  for (const f of listing) {
    if (f.name.endsWith('/')) {
      report.error('archive_directory', `dossier dans l’archive : « ${f.name} » (aucun dossier vide permis)`);
      ok = false;
      continue;
    }
    if (!ENTRY_NAME_RE.test(f.name)) {
      report.error('archive_entry_name', `nom d’entrée refusé : « ${f.name.slice(0, 80)} »`);
      ok = false;
      continue;
    }
    if (!KNOWN_ENTRIES.includes(f.name)) {
      report.error('archive_unknown_entry', `entrée inconnue « ${f.name} » : Filarr refuse le paquet entier${/^icon\./.test(f.name) ? ' (le format 1 ne transporte aucune image d’icône : l’icône est l’emoji manifest.icon)' : ''}`);
      ok = false;
    }
    if (vus.has(f.name)) {
      report.error('archive_duplicate', `entrée en double : « ${f.name} »`);
      ok = false;
    }
    vus.add(f.name);
    if (f.compression !== 0 && f.compression !== 8) {
      report.error('archive_method', `« ${f.name} » : méthode de compression ${f.compression} (store ou deflate seulement)`);
      ok = false;
    }
    annonce += f.originalSize;
  }
  if (annonce > MAX_UNCOMPRESSED_BYTES) {
    report.error('archive_bomb', `taille décompressée annoncée de ${formatBytes(annonce)} : 12 Mio au plus`);
    ok = false;
  }
  if (!ok) return null;

  // 2. La décompression en flux, coupée à la borne de chaque entrée et du total.
  const entries = new Map<string, Uint8Array>();
  let total = 0;
  let failure: string | null = null;
  const locales: string[] = [];
  const uz = new Unzip();
  uz.register(UnzipInflate);
  uz.onfile = (file) => {
    locales.push(file.name);
    const cap = entryCap(file.name);
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = `« ${file.name} » : ${err.message}`;
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > cap || total > MAX_UNCOMPRESSED_BYTES) {
        failure = size > cap ? `« ${file.name} » dépasse sa borne une fois décompressée (${formatBytes(cap)})` : 'plus de 12 Mio une fois décompressée (bombe de décompression)';
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const out = new Uint8Array(size);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        entries.set(file.name, out);
      }
    };
    file.start();
  };
  try {
    uz.push(data, true);
  } catch (e) {
    failure = failure ?? (e instanceof Error ? e.message : String(e));
  }
  if (failure) {
    report.error('archive_bomb', `archive refusée : ${failure}`);
    return null;
  }
  // Les en-têtes locaux doivent dire la même chose que le répertoire central.
  if (locales.length !== listing.length || new Set(locales).size !== locales.length || !locales.every((n) => vus.has(n))) {
    report.error('archive_mismatch', 'les en-têtes locaux de l’archive ne correspondent pas à son répertoire central');
    return null;
  }
  report.ok('archive', `archive ZIP conforme : ${listing.length} entrées, ${formatBytes(data.byteLength)} (${formatBytes(total)} décompressés)`);
  return { entries };
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface VerifyResult {
  report: Report;
  description?: PackageDescription;
}

/**
 * Relit un paquet comme Filarr le relira. N'EXÉCUTE rien (le bundle est
 * compilé, jamais appelé) : un paquet venu d'ailleurs reste une donnée.
 */
export function verifyPackage(data: Uint8Array, opts: { engineSource?: string; compile?: CompileCheck } = {}): VerifyResult {
  const report = new Report();
  const archive = readArchive(data, report);
  if (!archive) return { report };
  const { entries } = archive;

  const descBytes = entries.get(DESCRIPTION_ENTRY);
  if (!descBytes) {
    report.error('missing_description', `${DESCRIPTION_ENTRY} manquant`);
    return { report };
  }
  const descText = decodeUtf8(descBytes);
  if (descText === null) {
    report.error('description_encoding', `${DESCRIPTION_ENTRY} n’est pas en UTF-8`);
    return { report };
  }
  const scan = scanJson(descText);
  if (!scan.ok) {
    report.error('description_json', `${DESCRIPTION_ENTRY} : ${scan.code === 'forbidden_key' ? `clé interdite « ${scan.detail} »` : (scan.detail ?? 'JSON invalide')}`);
    return { report };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(descText);
  } catch (e) {
    report.error('description_json', `${DESCRIPTION_ENTRY} : JSON invalide (${e instanceof Error ? e.message : ''})`);
    return { report };
  }
  const v = validatePackageDescription(raw, descBytes.byteLength);
  if (!report.issues(v.issues, 'description', `${DESCRIPTION_ENTRY} conforme (format ${PACKAGE_FORMAT})`) || !v.description) return { report };
  const desc = v.description;

  // Les captures : celles qu'annonce la description, et rien d'autre.
  const annoncees = desc.screenshots ?? [];
  for (const name of SCREENSHOT_ENTRIES) {
    const bytes = entries.get(name);
    if (bytes && !annoncees.includes(name)) report.error('screenshot_unlisted', `« ${name} » est dans l’archive mais pas dans screenshots : elle ne serait pas relue`);
  }
  for (const name of annoncees) {
    const bytes = entries.get(name);
    if (!bytes) report.error('screenshot_missing', `« ${name} » est annoncée mais absente de l’archive`);
    else checkScreenshot(bytes, name, report);
  }

  // Le bundle.
  const bundleBytes = entries.get(BUNDLE_ENTRY);
  if (!bundleBytes) {
    report.error('missing_bundle', `${BUNDLE_ENTRY} manquant`);
    return { report, description: desc };
  }
  const code = decodeUtf8(bundleBytes);
  if (code === null) {
    report.error('bundle_encoding', `${BUNDLE_ENTRY} n’est pas en UTF-8`);
    return { report, description: desc };
  }
  checkBundleShape(code, bundleBytes.byteLength, report, opts.compile);

  // Sans code : la configuration, deux fois, et identique.
  const nocodeBytes = entries.get(NOCODE_ENTRY);
  if (desc.build.kind === 'nocode') {
    if (!nocodeBytes) report.error('missing_nocode', `${NOCODE_ENTRY} manquant (build.kind = "nocode")`);
    else {
      const parsed = parseNocodeConfigFromBundle(code);
      const text = decodeUtf8(nocodeBytes);
      if (!parsed.ok) report.error('nocode_boot', parsed.reason, BUNDLE_ENTRY);
      else if (text === null) report.error('nocode_encoding', `${NOCODE_ENTRY} n’est pas en UTF-8`);
      else {
        let fromFile: unknown = null;
        const s = scanJson(text);
        try {
          fromFile = s.ok ? JSON.parse(text) : null;
        } catch {
          fromFile = null;
        }
        if (fromFile === null) report.error('nocode_json', `${NOCODE_ENTRY} : JSON illisible ou clé interdite`);
        else if (JSON.stringify(fromFile) !== JSON.stringify(parsed.config)) report.error('nocode_mismatch', `la configuration du bundle diffère de ${NOCODE_ENTRY} : Filarr refuse le paquet`);
        else {
          report.ok('nocode_match', `${NOCODE_ENTRY} identique à la configuration du bundle`);
          const cv = validateConfig(parsed.config);
          if (!cv.ok) for (const i of cv.issues) report.error('nocode_config', `configuration refusée par le moteur : ${i.path} — ${i.message}`, NOCODE_ENTRY);
          else report.issues(checkNocodeAgainstManifest(cv.config, desc.manifest), 'nocode_manifest', 'configuration et manifeste s’accordent');
        }
        if (desc.build.kind === 'nocode' && parsed.engineVersion !== desc.build.engine) {
          report.error('engine_mismatch', `le bundle dit moteur ${parsed.engineVersion}, la description ${desc.build.engine}`);
        }
        if (opts.engineSource && parsed.engineVersion === ENGINE_VERSION && parsed.engineSource !== opts.engineSource.replace(/\s+$/, '')) {
          report.warn('engine_differs', `le moteur du bundle n’est pas celui que filarr-ext ${ENGINE_VERSION} fabrique pour cette version`, BUNDLE_ENTRY);
        }
      }
    }
  } else if (nocodeBytes) {
    report.error('unexpected_nocode', `${NOCODE_ENTRY} présent alors que build.kind = "code"`);
  }

  // Sans code, le moteur pose `<id>-editor` depuis nocode.json › id, déjà comparé au manifeste :
  // le lire dans le texte du bundle ne prouverait rien de plus.
  if (desc.build.kind === 'code') checkEntryPoints(code, desc.manifest, report, { execute: false });
  scanApis(code, report);
  return { report, description: desc };
}

/**
 * Assemble l'archive d'un projet déjà contrôlé. Les images sont stockées sans
 * recompression (elles le sont déjà), le reste en deflate. `opts.tool` : ce que
 * déclare `build.tool` quand un autre outil que `filarr-ext` assemble le paquet
 * (Filarr Builder) ; par défaut `filarr-ext <version>`.
 */
export function assemblePackage(check: CheckResult, toolVersion: string, opts: { tool?: string } = {}): { bytes: Uint8Array; description: PackageDescription } {
  const project = check.project!;
  const build = check.build!;
  const manifest = check.manifest!;
  const screenshots = check.screenshots.map((_, i) => SCREENSHOT_ENTRIES[i]);
  const description: PackageDescription = {
    format: 1,
    manifest,
    ...(project.listing ? { listing: project.listing } : {}),
    ...(screenshots.length ? { screenshots: [...screenshots] } : {}),
    build:
      build.kind === 'nocode'
        ? { kind: 'nocode', tool: opts.tool ?? `filarr-ext ${toolVersion}`, engine: build.engineVersion ?? ENGINE_VERSION }
        : { kind: 'code', tool: opts.tool ?? `filarr-ext ${toolVersion}` },
  };
  const files: Zippable = {
    [DESCRIPTION_ENTRY]: [ENC.encode(`${JSON.stringify(description, null, 2)}\n`), { level: 9, mtime: FIXED_MTIME }],
    [BUNDLE_ENTRY]: [ENC.encode(build.code!), { level: 9, mtime: FIXED_MTIME }],
  };
  if (build.kind === 'nocode') {
    // EXACTEMENT le JSON de la dernière ligne du bundle : identique au texte comme à la valeur.
    files[NOCODE_ENTRY] = [ENC.encode(build.configJson ?? serializeNocodeConfig(build.config)), { level: 9, mtime: FIXED_MTIME }];
  }
  check.screenshots.forEach((s, i) => {
    files[SCREENSHOT_ENTRIES[i]] = [s.bytes, { level: 0, mtime: FIXED_MTIME }];
  });
  return { bytes: zipSync(files), description };
}
