/**
 * pack — le paquet `.filarrext`, EXACTEMENT celui de PACKAGE.md, par le même
 * chemin que `filarr-ext pack` (packages/cli/src/main.ts, `cmdPack`) :
 *
 *   1. tous les contrôles passent, sinon rien n'est fabriqué ;
 *   2. `assemblePackage` de l'outil assemble l'archive (mêmes entrées, même
 *      date fixe, mêmes niveaux de compression) ;
 *   3. le paquet est RELU par `verifyPackage`, le chemin de `filarr-ext
 *      verify` ; s'il ne passe pas sa propre relecture, il n'existe pas.
 *
 * Le paquet ne porte ni clé, ni signature, ni jeton : la signature se fait dans
 * Filarr, sur l'appareil de l'auteur. Le Builder ne la voit jamais.
 */

import type { PackageDescription } from '@filarr/extension-api';
import { assemblePackage, verifyPackage } from '@filarr-cli/package';
import { formatBytes } from '@filarr-cli/report';
import type { CheckResult } from '@filarr-cli/check';
import { sha256Hex } from './bytes';
import type { BuildResult } from './build';
import { runChecks, type CheckOutcome, type SandboxProbe } from './checks';
import { packageFileName, type FileMap } from './project';
import { compileAsFunctionBody } from './syntax';
import { BUILDER_TOOL, BUILDER_VERSION } from './version';

export interface PackResult {
  ok: boolean;
  check: CheckOutcome;
  bytes?: Uint8Array;
  fileName?: string;
  description?: PackageDescription;
  /** L'empreinte du bundle : celle que Filarr recalculera et signera (`bundleHash`). */
  bundleSha256?: string;
  bundleBytes?: number;
}

export async function makePackage(files: FileMap, build: BuildResult, engineSource: string, probe?: SandboxProbe | null): Promise<PackResult> {
  const check = runChecks(files, build, { probe });
  const report = check.report;
  if (!report.passed || !check.manifest || !check.build?.code) {
    report.error('pack_refused', 'paquet NON fabriqué : corrigez les erreurs ci-dessus');
    return { ok: false, check };
  }
  // CheckOutcome a la forme que lit assemblePackage : projet (sa fiche), construction, manifeste, captures.
  const { bytes, description } = assemblePackage(check as unknown as CheckResult, BUILDER_VERSION, { tool: BUILDER_TOOL });
  const relu = verifyPackage(bytes, {
    engineSource: build.kind === 'nocode' ? engineSource : undefined,
    compile: compileAsFunctionBody,
  });
  if (!relu.report.passed) {
    report.merge(relu.report);
    report.error('pack_refused', 'le paquet assemblé ne passe pas sa propre relecture : rien n’est fabriqué');
    return { ok: false, check };
  }
  const fileName = packageFileName(check.manifest);
  report.ok('pack', `paquet prêt : ${fileName} (${formatBytes(bytes.byteLength)}), relu comme le relira filarr-ext verify`);
  const bundle = new TextEncoder().encode(build.code);
  return { ok: true, check, bytes, fileName, description, bundleSha256: await sha256Hex(bundle), bundleBytes: bundle.byteLength };
}
