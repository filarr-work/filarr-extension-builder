/**
 * build — `dist/bundle.js`, le bundle qu'exécute la page bac à sable.
 *
 * Avec code : esbuild, IIFE, ES2020, minifié, en ASCII, sans commentaire ni
 * carte de sources. La page exécute le bundle comme un CORPS DE FONCTION
 * (`new Function('globalThis', code)`) : un `import`/`export` résiduel y est
 * une erreur de syntaxe — l'IIFE l'exclut par construction.
 *
 * Sans code : le moteur (identique pour toutes) suivi des deux lignes du
 * PACKAGE.md §4. La configuration est validée avant : on ne construit jamais
 * ce que le moteur refuserait au montage.
 */

import { build as esbuild, type BuildOptions, type Plugin } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildNocodeBundle,
  EMBEDDED_ENGINE_SOURCE,
  ENGINE_VERSION,
  MAX_CONFIG_BYTES,
  NocodeConfigError,
  serializeNocodeConfig,
  validateConfig,
  type ConfigIssue,
  type NocodeConfig,
} from '@filarr/nocode-engine';
import { projectPath, readJsonFile, type Project } from './project';

export interface BuildResult {
  ok: boolean;
  /** Le bundle, quand `ok`. */
  code?: string;
  kind: 'code' | 'nocode';
  errors: string[];
  warnings: string[];
  /** Sans code : la configuration validée, et son JSON tel qu'il est dans le bundle. */
  config?: NocodeConfig;
  configJson?: string;
  configIssues?: ConfigIssue[];
  engineVersion?: string;
}

let engineCache: string | null = null;

/**
 * Le moteur sans code. Embarqué au build de `filarr-ext` ; depuis les sources
 * (tests, dépôt), construit à la demande.
 */
export async function engineSource(): Promise<string> {
  if (EMBEDDED_ENGINE_SOURCE) return EMBEDDED_ENGINE_SOURCE;
  if (engineCache) return engineCache;
  const mod = (await import('@filarr/nocode-engine/scripts/engine.mjs')) as { buildEngineSource(): Promise<string> };
  engineCache = await mod.buildEngineSource();
  return engineCache;
}

/** Les options de la CIBLE, communes au bundle et à ses workers. */
function targetOptions(opts: { minify?: boolean }): BuildOptions {
  return {
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: opts.minify !== false,
    charset: 'ascii',
    legalComments: 'none',
    // Dans le dépôt du Builder, l'API se lit depuis ses sources ; publiée, elle les embarque aussi.
    conditions: ['filarr-source'],
    write: false,
    logLevel: 'silent',
  };
}

/**
 * `import source from './calcul.worker.ts?worker'` : le fichier est construit À
 * PART, en IIFE, et importé comme TEXTE. L'extension en fait un `Blob`, puis un
 * `Worker` depuis son URL `blob:` — la seule source que la CSP de la page
 * permet (`worker-src blob:`) ; le worker hérite de cette CSP, donc d'aucun
 * réseau. Même convention que les exemples avec code du dépôt.
 */
function workerPlugin(opts: { minify?: boolean }): Plugin {
  return {
    name: 'filarr-worker-texte',
    setup(b) {
      b.onResolve({ filter: /\?worker$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/\?worker$/, '')),
        namespace: 'filarr-worker',
      }));
      b.onLoad({ filter: /.*/, namespace: 'filarr-worker' }, async (args) => {
        const out = await esbuild({ ...targetOptions(opts), entryPoints: [args.path] });
        const code = out.outputFiles?.[0]?.text ?? '';
        try {
          new Function(code);
        } catch (e) {
          return { errors: [{ text: `worker ${args.path} : ne se compile pas comme script (${e instanceof Error ? e.message : String(e)})` }] };
        }
        return { contents: `export default ${JSON.stringify(code)};`, loader: 'js', watchFiles: [args.path] };
      });
    },
  };
}

/** Les options esbuild d'un bundle d'extension — exportées pour le simulateur. */
export function codeBuildOptions(project: Project, opts: { minify?: boolean; sourcemap?: boolean } = {}): BuildOptions {
  return {
    ...targetOptions(opts),
    entryPoints: [projectPath(project.dir, (project.build as { entry: string }).entry, 'build.entry')],
    absWorkingDir: project.dir,
    sourcemap: opts.sourcemap ? 'inline' : false,
    plugins: [workerPlugin(opts)],
  };
}

export async function buildCode(project: Project, opts: { minify?: boolean; sourcemap?: boolean } = {}): Promise<BuildResult> {
  try {
    const r = await esbuild(codeBuildOptions(project, opts));
    const out = r.outputFiles?.[0];
    return {
      ok: true,
      kind: 'code',
      code: out ? out.text : '',
      errors: [],
      warnings: r.warnings.map((w) => w.text),
    };
  } catch (e) {
    const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
    return {
      ok: false,
      kind: 'code',
      errors: errs?.length
        ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line} — ${x.text}` : x.text))
        : [e instanceof Error ? e.message : String(e)],
      warnings: [],
    };
  }
}

export function readNocodeConfig(project: Project): { config: unknown; bytes: number } {
  const path = projectPath(project.dir, (project.build as { config: string }).config, 'build.config');
  const { value, bytes } = readJsonFile(path, MAX_CONFIG_BYTES, (project.build as { config: string }).config);
  return { config: value, bytes };
}

export async function buildNocode(project: Project): Promise<BuildResult> {
  let raw: unknown;
  try {
    raw = readNocodeConfig(project).config;
  } catch (e) {
    return { ok: false, kind: 'nocode', errors: [e instanceof Error ? e.message : String(e)], warnings: [] };
  }
  const verdict = validateConfig(raw);
  if (!verdict.ok) {
    return {
      ok: false,
      kind: 'nocode',
      errors: verdict.issues.map((i) => `nocode.json › ${i.path} : ${i.message}`),
      warnings: [],
      configIssues: verdict.issues,
    };
  }
  try {
    const code = buildNocodeBundle(verdict.config, { engineVersion: ENGINE_VERSION, engineSource: await engineSource() });
    return {
      ok: true,
      kind: 'nocode',
      code,
      errors: [],
      warnings: [],
      config: verdict.config,
      configJson: serializeNocodeConfig(verdict.config),
      engineVersion: ENGINE_VERSION,
    };
  } catch (e) {
    const issues = e instanceof NocodeConfigError ? e.issues : undefined;
    return { ok: false, kind: 'nocode', errors: [e instanceof Error ? e.message : String(e)], warnings: [], ...(issues ? { configIssues: issues } : {}) };
  }
}

export async function buildProject(project: Project, opts: { minify?: boolean; sourcemap?: boolean } = {}): Promise<BuildResult> {
  return project.build.kind === 'code' ? buildCode(project, opts) : buildNocode(project);
}

/** Écrit `dist/bundle.js` (et rien d'autre). */
export function writeBundle(project: Project, code: string): string {
  mkdirSync(project.outDir, { recursive: true });
  const path = join(project.outDir, 'bundle.js');
  writeFileSync(path, code);
  return path;
}
