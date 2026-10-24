/**
 * checks — « Contrôles avant publication » : les contrôles de `filarr-ext
 * check`, dans le même ordre et avec les mêmes messages, sur un projet en
 * mémoire.
 *
 * On réutilise les briques de l'outil (packages/cli/src) — `Report`,
 * `checkBundleShape`, `checkEntryPoints`, `scanApis`, `checkScreenshot` — et
 * les validateurs partagés (`validateManifest`, `validateListing`,
 * `checkNocodeAgainstManifest`). Seul l'enchaînement de `runCheck` est réécrit,
 * parce que l'outil lit le disque.
 *
 * Deux écarts, imposés par le navigateur et dits ici :
 *  · la syntaxe se lit avec un analyseur (`syntax.ts`) : la CSP de l'atelier
 *    refuse `new Function`, et c'est voulu ;
 *  · l'outil exécute le bundle À BLANC dans `node:vm` pour lire ce qu'il pose ;
 *    l'atelier, jamais. Il lit le bundle (`execute: false`, comme `verify`),
 *    puis le simulateur le monte dans la vraie page bac à sable et rend son
 *    verdict (`probe`), qui rejoint le rapport.
 *
 * Après les lignes de l'outil viennent celles que seul le Builder sait faire :
 * version supérieure à la dernière publiée, exemples qui s'ouvrent avec la
 * configuration, champs déclarés obligatoires présents dans les exemples.
 */

import {
  estimateSignedManifestBytes,
  MAX_SCREENSHOTS,
  MAX_SIGNED_MANIFEST_BYTES,
  validateListing,
  validateManifest,
  type ExtensionManifest,
} from '@filarr/extension-api';
import { checkNocodeAgainstManifest, openDocument, parseNocodeConfigFromBundle, type NocodeConfig } from '@filarr/nocode-engine';
import { checkBundleShape, checkEntryPoints, scanApis } from '@filarr-cli/checks';
import { checkScreenshot } from '@filarr-cli/images';
import { formatBytes, Report } from '@filarr-cli/report';
import { utf8 } from './bytes';
import type { BuildResult } from './build';
import { checkRequired } from './required';
import { compareSemver, PROJECT_FILE, readMeta, sampleFiles, tryParseProject, type FileMap, type ProjectDescriptor } from './project';
import { compileAsFunctionBody } from './syntax';

export { Report };
export type { ReportLine } from '@filarr-cli/report';

/** Ce que le simulateur a constaté en montant le bundle dans la page bac à sable. */
export interface SandboxProbe {
  editorId: string;
  mounted: boolean;
  error?: string;
  functions?: { name: string; ok: boolean; error?: string }[];
}

export interface CheckOutcome {
  report: Report;
  project?: ProjectDescriptor;
  build?: BuildResult;
  manifest?: ExtensionManifest;
  screenshots: { path: string; bytes: Uint8Array; mime: string }[];
}

export function runChecks(files: FileMap, build: BuildResult | null, opts: { probe?: SandboxProbe | null } = {}): CheckOutcome {
  const report = new Report();
  const result: CheckOutcome = { report, screenshots: [] };

  const parsed = tryParseProject(files);
  if (!parsed.ok) {
    report.error('project', parsed.error.message, parsed.error.field ?? PROJECT_FILE);
    return result;
  }
  const project = parsed.project;
  result.project = project;
  report.ok('project', `${PROJECT_FILE} lu (${project.build.kind === 'code' ? 'avec code' : 'sans code'})`);

  // ── Le manifeste et la fiche (runCheck, même ordre) ─────────────────────
  const verdict = validateManifest(project.manifest);
  const m = project.manifest;
  report.issues(verdict.issues, 'manifest', `manifeste : ${m.id} ${m.version}, ${(m.extensions ?? []).map((e) => `.${e}`).join(' ')}${m.capabilities ? `, capacités ${Object.keys(m.capabilities).join(', ')}` : ''}`);
  if (verdict.ok) result.manifest = verdict.manifest;
  if (m.icon === undefined) report.warn('no_icon', 'pas d’icône : ajoutez un emoji dans manifest.icon (le paquet ne transporte aucune image d’icône)', 'manifest.icon');
  report.issues(validateListing(project.listing), 'listing', project.listing ? 'fiche : notes, sources et licence conformes' : undefined);
  if (!project.listing?.license) report.warn('no_license', 'aucune licence déclarée (listing.license)', 'listing.license');

  // ── Les captures ─────────────────────────────────────────────────────────
  if (project.screenshots.length > MAX_SCREENSHOTS) report.error('screenshots_count', `${project.screenshots.length} captures : 4 au plus`, 'screenshots');
  project.screenshots.slice(0, MAX_SCREENSHOTS).forEach((rel, i) => {
    const bytes = files[rel];
    if (!bytes) {
      report.error('screenshot_missing', `capture introuvable : ${rel}`, `screenshots[${i}]`);
      return;
    }
    const info = checkScreenshot(bytes, rel, report);
    if (info) result.screenshots.push({ path: rel, bytes, mime: info.mime });
  });
  if (project.screenshots.length === 0) report.warn('no_screenshots', 'aucune capture : la fiche n’aura rien à montrer', 'screenshots');

  if (verdict.ok && verdict.manifest) {
    const size = estimateSignedManifestBytes(verdict.manifest, result.screenshots.map((s) => ({ mime: s.mime, bytes: s.bytes.byteLength })));
    if (size > MAX_SIGNED_MANIFEST_BYTES) report.error('manifest_too_large', `le manifeste signé ferait ${formatBytes(size)} avec ses captures : le serveur refuse au-delà de 640 Kio (manifest_too_large)`, 'manifest');
    else report.ok('manifest_size', `manifeste signé estimé à ${formatBytes(size)} (≤ 640 Kio)`);
  }

  // ── Le build ─────────────────────────────────────────────────────────────
  if (!build) {
    report.warn('build_pending', 'construction en cours…');
    return result;
  }
  result.build = build;
  if (!build.ok || build.code === undefined) {
    for (const e of build.errors) report.error('build', e, project.build.kind === 'nocode' ? 'nocode.json' : 'build.entry');
    builderChecks(files, project, null, report);
    return result;
  }
  for (const w of build.warnings) report.warn('build_warning', `esbuild : ${w}`);
  report.ok('build', project.build.kind === 'code' ? 'build esbuild : IIFE, ES2020, ASCII' : `configuration sans code valide, moteur ${build.engineVersion}`);

  const code = build.code;
  checkBundleShape(code, utf8(code).byteLength, report, compileAsFunctionBody);

  if (project.build.kind === 'nocode' && build.config) {
    if (verdict.manifest) report.issues(checkNocodeAgainstManifest(build.config, verdict.manifest), 'nocode_manifest', 'nocode.json et le manifeste disent la même chose');
    const reread = parseNocodeConfigFromBundle(code);
    if (!reread.ok) report.error('nocode_boot', reread.reason, 'bundle.js');
    else if (JSON.stringify(reread.config) !== JSON.stringify(build.config) || reread.json !== build.configJson) report.error('nocode_boot', 'la configuration relue dans le bundle diffère de nocode.json', 'bundle.js');
    else report.ok('nocode_boot', 'relu comme Filarr le relira : deux lignes finales, JSON identique à nocode.json');
    // Le moteur pose `<id>-editor` depuis nocode.json › id, déjà comparé au manifeste (comme `verify`).
  } else if (verdict.manifest) {
    checkEntryPoints(code, verdict.manifest, report, { execute: false });
  }
  scanApis(code, report);
  if (opts.probe) probeLines(opts.probe, report);
  builderChecks(files, project, build.config ?? null, report);
  return result;
}

/** Le verdict du simulateur : ce que l'outil apprend par l'exécution à blanc, appris dans la vraie page. */
function probeLines(p: SandboxProbe, report: Report): void {
  if (p.mounted) report.ok('sandbox_mount', `monté dans la page bac à sable de Filarr : éditeur « ${p.editorId} »`);
  else report.error('sandbox_mount', `la page bac à sable refuse le montage : ${p.error ?? 'erreur inconnue'}`, 'bundle.js');
  for (const f of p.functions ?? []) {
    if (f.ok) report.ok('sandbox_function', `fonction ${f.name} : répond dans la page sans API`);
    else report.error('function_missing', `la capacité functions déclare « ${f.name} », mais la page répond : ${f.error ?? 'échec'}`, 'bundle.js');
  }
}

/** Ce que seul le Builder sait vérifier. */
function builderChecks(files: FileMap, project: ProjectDescriptor, config: NocodeConfig | null, report: Report): void {
  const meta = readMeta(files);
  const v = project.manifest.version;
  if (meta.lastPublished && typeof v === 'string') {
    if (compareSemver(v, meta.lastPublished) <= 0) report.error('version_not_greater', `version ${v} : la dernière publiée est ${meta.lastPublished}, chaque version est unique et définitive — choisissez-en une supérieure`, 'manifest.version');
    else report.ok('version_greater', `version ${v}, nouvelle et supérieure à ${meta.lastPublished}`);
  }
  const samples = sampleFiles(files, project.samples);
  if (samples.length === 0) report.warn('no_samples', `aucun fichier d’exemple dans ${project.samples}/ : le simulateur ouvrira un document neuf`, project.samples);
  if (!config) return;
  for (const s of samples) {
    const r = openDocument(files[s.path], config);
    if (!r.ok) report.warn('sample_unreadable', `l’exemple ${s.name} ne s’ouvre pas avec cette configuration (${r.code}${r.detail ? ` : ${r.detail}` : ''})`, s.path);
  }
  for (const line of checkRequired(files, samples, config, meta.required ?? {})) report.warn('required_missing', line.message, line.path);
}
