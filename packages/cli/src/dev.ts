/**
 * dev — `filarr-ext dev` : le simulateur local, reconstruit à chaque modification.
 *
 * L'outil construit (esbuild en incrémental pour le code, le moteur et la
 * configuration en sans code) ; le simulateur (`@filarr/extension-devhost`)
 * surveille le projet, sert la page bac à sable de Filarr et rejoue le
 * protocole v2 côté hôte. Chaque construction recharge les pages ouvertes.
 */

import { context, type BuildContext } from 'esbuild';
import { join } from 'node:path';
import { validateManifest } from '@filarr/extension-api';
import { buildNocode, codeBuildOptions } from './build';
import { loadProject, projectPath } from './project';
import { openUrl } from './publish';

export interface DevBuild {
  ok: boolean;
  kind: 'code' | 'nocode';
  code?: string;
  errors: string[];
  warnings: string[];
  manifest: unknown;
}

export async function startDev(
  dir: string,
  opts: { port: number; open: boolean; log(s: string): void; error(s: string): void }
): Promise<{ url: string; close(): Promise<void> }> {
  const { startDevHost } = (await import('@filarr/extension-devhost')) as typeof import('@filarr/extension-devhost');
  let ctx: BuildContext | null = null;
  let ctxEntry: string | null = null;

  const build = async (): Promise<DevBuild> => {
    let project;
    try {
      project = loadProject(dir);
    } catch (e) {
      return { ok: false, kind: 'code', errors: [e instanceof Error ? e.message : String(e)], warnings: [], manifest: null };
    }
    const manifestIssues = validateManifest(project.manifest).issues;
    const warnings = manifestIssues.map((i) => `${i.level === 'error' ? 'manifeste (refusé à la publication)' : 'manifeste'} : ${i.message}`);
    if (project.build.kind === 'nocode') {
      await ctx?.dispose();
      ctx = null;
      const r = await buildNocode(project);
      return { ok: r.ok, kind: 'nocode', code: r.code, errors: r.errors, warnings: [...warnings, ...r.warnings], manifest: project.manifest };
    }
    const entry = projectPath(project.dir, project.build.entry, 'build.entry');
    if (!ctx || ctxEntry !== entry) {
      await ctx?.dispose();
      // Sans minification et avec la carte de sources : on lit ses erreurs dans le navigateur.
      ctx = await context(codeBuildOptions(project, { minify: false, sourcemap: true }));
      ctxEntry = entry;
    }
    try {
      const r = await ctx.rebuild();
      return { ok: true, kind: 'code', code: r.outputFiles?.[0]?.text ?? '', errors: [], warnings: [...warnings, ...r.warnings.map((w) => w.text)], manifest: project.manifest };
    } catch (e) {
      const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
      return {
        ok: false,
        kind: 'code',
        errors: errs?.length ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line} — ${x.text}` : x.text)) : [String(e)],
        warnings,
        manifest: project.manifest,
      };
    }
  };

  const project = loadProject(dir);
  const host = await startDevHost({
    port: opts.port,
    build,
    watch: [project.dir],
    ignore: [join(project.dir, 'dist'), join(project.dir, 'node_modules'), join(project.dir, '.git')],
    samplesDir: projectPath(project.dir, project.samples, 'samples'),
    log: opts.log,
  });
  opts.log(`Simulateur Filarr : ${host.url}`);
  opts.log('Chaque modification du projet reconstruit l’extension et recharge la page. Ctrl+C pour arrêter.');
  if (opts.open) await openUrl(host.url).catch(() => opts.error('! impossible d’ouvrir le navigateur : ouvrez l’adresse ci-dessus'));
  return {
    url: host.url,
    async close() {
      await host.close();
      await ctx?.dispose();
    },
  };
}
