/**
 * check — tous les contrôles d'un PROJET, ceux du serveur comme ceux du client,
 * avant d'avoir dépensé une publication.
 *
 * Dans l'ordre : le fichier de projet, le manifeste (bornes du worker et
 * capacités, par le validateur vendorisé de Filarr), la fiche, les captures, la
 * taille du manifeste qui sera signé, le build, puis le bundle lui-même (taille,
 * forme, global, points d'entrée, API que la page ferme). En sans code : la
 * configuration, son accord avec le manifeste, et la relecture du bundle comme
 * Filarr la fera.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  estimateSignedManifestBytes,
  MAX_SCREENSHOTS,
  MAX_SIGNED_MANIFEST_BYTES,
  validateListing,
  validateManifest,
  type ExtensionManifest,
} from '@filarr/extension-api';
import { checkNocodeAgainstManifest, parseNocodeConfigFromBundle } from '@filarr/nocode-engine';
import { buildProject, type BuildResult } from './build';
import { checkBundleShape, checkEntryPoints, scanApis } from './checks';
import { checkScreenshot } from './images';
import { loadProject, projectPath, PROJECT_FILE, ProjectError, type Project } from './project';
import { formatBytes, Report } from './report';

export interface CheckResult {
  report: Report;
  project?: Project;
  build?: BuildResult;
  manifest?: ExtensionManifest;
  /** Les captures lues, dans l'ordre, avec leur type. */
  screenshots: { path: string; bytes: Uint8Array; mime: string }[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function runCheck(dir: string, opts: { minify?: boolean } = {}): Promise<CheckResult> {
  const report = new Report();
  const result: CheckResult = { report, screenshots: [] };

  let project: Project;
  try {
    project = loadProject(dir);
  } catch (e) {
    report.error('project', e instanceof Error ? e.message : String(e), e instanceof ProjectError ? e.field : PROJECT_FILE);
    return result;
  }
  result.project = project;
  report.ok('project', `${PROJECT_FILE} lu (${project.build.kind === 'code' ? 'avec code' : 'sans code'})`);

  // ── Le manifeste et la fiche ─────────────────────────────────────────────
  const verdict = validateManifest(project.manifest);
  const m = project.manifest;
  report.issues(verdict.issues, 'manifest', `manifeste : ${m.id} ${m.version}, ${(m.extensions ?? []).map((e) => `.${e}`).join(' ')}${m.capabilities ? `, capacités ${Object.keys(m.capabilities).join(', ')}` : ''}`);
  if (verdict.ok) result.manifest = verdict.manifest;
  if (m.icon === undefined) report.warn('no_icon', 'pas d’icône : ajoutez un emoji dans manifest.icon (le paquet ne transporte aucune image d’icône)', 'manifest.icon');
  report.issues(validateListing(project.listing), 'listing', project.listing ? 'fiche : notes, sources et licence conformes' : undefined);
  if (!project.listing?.license) report.warn('no_license', 'aucune licence déclarée (listing.license)', 'listing.license');

  // ── Les captures ─────────────────────────────────────────────────────────
  if (project.screenshots.length > MAX_SCREENSHOTS) {
    report.error('screenshots_count', `${project.screenshots.length} captures : 4 au plus`, 'screenshots');
  }
  project.screenshots.slice(0, MAX_SCREENSHOTS).forEach((rel, i) => {
    const path = projectPath(project.dir, rel, `screenshots[${i}]`);
    if (!existsSync(path) || !statSync(path).isFile()) {
      report.error('screenshot_missing', `capture introuvable : ${rel}`, `screenshots[${i}]`);
      return;
    }
    const bytes = new Uint8Array(readFileSync(path));
    const info = checkScreenshot(bytes, rel, report);
    if (info) result.screenshots.push({ path: rel, bytes, mime: info.mime });
  });
  if (project.screenshots.length === 0) report.warn('no_screenshots', 'aucune capture : la fiche n’aura rien à montrer', 'screenshots');

  if (verdict.ok && verdict.manifest) {
    const size = estimateSignedManifestBytes(verdict.manifest, result.screenshots.map((s) => ({ mime: s.mime, bytes: s.bytes.byteLength })));
    if (size > MAX_SIGNED_MANIFEST_BYTES) {
      report.error('manifest_too_large', `le manifeste signé ferait ${formatBytes(size)} avec ses captures : le serveur refuse au-delà de 640 Kio (manifest_too_large)`, 'manifest');
    } else {
      report.ok('manifest_size', `manifeste signé estimé à ${formatBytes(size)} (≤ 640 Kio)`);
    }
  }

  // ── Le build ─────────────────────────────────────────────────────────────
  const build = await buildProject(project, { minify: opts.minify });
  result.build = build;
  if (!build.ok || build.code === undefined) {
    for (const e of build.errors) report.error('build', e, project.build.kind === 'nocode' ? 'nocode.json' : 'build.entry');
    return result;
  }
  for (const w of build.warnings) report.warn('build_warning', `esbuild : ${w}`);
  report.ok('build', project.build.kind === 'code' ? 'build esbuild : IIFE, ES2020, ASCII' : `configuration sans code valide, moteur ${build.engineVersion}`);

  const code = build.code;
  const bytes = Buffer.byteLength(code, 'utf8');
  checkBundleShape(code, bytes, report);

  if (project.build.kind === 'nocode' && build.config) {
    if (verdict.manifest) report.issues(checkNocodeAgainstManifest(build.config, verdict.manifest), 'nocode_manifest', 'nocode.json et le manifeste disent la même chose');
    const parsed = parseNocodeConfigFromBundle(code);
    if (!parsed.ok) report.error('nocode_boot', parsed.reason, 'bundle.js');
    else if (!deepEqual(parsed.config, build.config) || parsed.json !== build.configJson) report.error('nocode_boot', 'la configuration relue dans le bundle diffère de nocode.json', 'bundle.js');
    else report.ok('nocode_boot', 'relu comme Filarr le relira : deux lignes finales, JSON identique à nocode.json');
    // Le moteur est le nôtre et la configuration une donnée : l'exécution à blanc est sans risque.
    if (verdict.manifest) checkEntryPoints(code, verdict.manifest, report, { execute: true });
  } else if (verdict.manifest) {
    checkEntryPoints(code, verdict.manifest, report, { execute: true });
  }
  scanApis(code, report);
  return result;
}
