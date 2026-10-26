/**
 * build — le bundle, construit DANS le navigateur, comme `filarr-ext build`.
 *
 * Sans code : le moteur (le même que celui de l'outil, embarqué au build du
 * Builder) suivi des deux lignes de PACKAGE.md §4, par `buildNocodeBundle`.
 *
 * Avec code : esbuild-wasm, avec les options de la CIBLE recopiées de
 * `packages/cli/src/build.ts` (IIFE, ES2020, minifié, ASCII, sans commentaire
 * légal) et la même convention `?worker`. esbuild-wasm est le même esbuild
 * (0.25.12) compilé en WebAssembly : mêmes sources, mêmes options, même sortie
 * — un test le vérifie sur un exemple du dépôt.
 *
 * Il n'y a pas de système de fichiers : un greffon résout chaque import dans la
 * carte du projet. Les dépendances npm ne se téléchargent pas (aucun réseau) :
 * seules celles que le Builder embarque sont résolues, les autres sont une
 * erreur qui dit quoi faire.
 */

import {
  buildNocodeBundle,
  ENGINE_VERSION,
  MAX_CONFIG_BYTES,
  NocodeConfigError,
  serializeNocodeConfig,
  validateConfig,
  type ConfigIssue,
  type NocodeConfig,
} from '@filarr/nocode-engine';
import type { BuildOptions, Plugin, Message } from 'esbuild-wasm';
import { strictText } from './bytes';
import { readJson, ProjectError, type FileMap, type ProjectDescriptor } from './project';
import { syntaxError } from './syntax';

export interface BuildResult {
  ok: boolean;
  kind: 'code' | 'nocode';
  code?: string;
  errors: string[];
  warnings: string[];
  config?: NocodeConfig;
  configJson?: string;
  configIssues?: ConfigIssue[];
  engineVersion?: string;
  /** Quand et en combien de temps : le panneau des contrôles l'affiche. */
  at: number;
  ms: number;
}

// ── Les dépendances : moteur, modules embarqués, esbuild ────────────────────

export interface BuildDeps {
  engineSource(): Promise<string>;
  modules(): Promise<Record<string, string>>;
  esbuild(): Promise<EsbuildApi>;
}

export type EsbuildApi = { build(options: BuildOptions): Promise<{ outputFiles?: { text: string }[]; warnings: Message[] }> };

let esbuildP: Promise<EsbuildApi> | null = null;

/** esbuild-wasm, chargé à la première construction avec code seulement (≈ 12 Mio de WebAssembly). */
function browserEsbuild(): Promise<EsbuildApi> {
  esbuildP ??= (async () => {
    const [mod, wasm] = await Promise.all([import('esbuild-wasm'), import('esbuild-wasm/esbuild.wasm?url')]);
    // Module CommonJS : selon l'outil qui le sert, l'API est à la racine ou sous `default`.
    const esbuild = ((mod as { initialize?: unknown }).initialize ? mod : (mod as unknown as { default: typeof mod }).default) as typeof mod;
    // Le WebAssembly vient de l'origine du Builder ; le worker d'esbuild aussi (URL blob:).
    await esbuild.initialize({ wasmURL: wasm.default, worker: true });
    return esbuild as unknown as EsbuildApi;
  })();
  esbuildP.catch(() => {
    esbuildP = null;
  });
  return esbuildP;
}

export const browserDeps: BuildDeps = {
  engineSource: () => import('virtual:filarr/engine').then((m) => m.ENGINE_SOURCE),
  modules: () => import('virtual:filarr/modules').then((m) => m.default),
  esbuild: browserEsbuild,
};

// ── Sans code ───────────────────────────────────────────────────────────────

export function readNocodeConfig(files: FileMap, project: ProjectDescriptor): unknown {
  const path = (project.build as { config: string }).config;
  return readJson(files, path, MAX_CONFIG_BYTES);
}

export async function buildNocode(files: FileMap, project: ProjectDescriptor, deps: BuildDeps): Promise<BuildResult> {
  const t0 = Date.now();
  const done = (r: Omit<BuildResult, 'at' | 'ms' | 'kind'>): BuildResult => ({ ...r, kind: 'nocode', at: Date.now(), ms: Date.now() - t0 });
  let raw: unknown;
  try {
    raw = readNocodeConfig(files, project);
  } catch (e) {
    return done({ ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [] });
  }
  const verdict = validateConfig(raw);
  if (!verdict.ok) {
    return done({ ok: false, errors: verdict.issues.map((i) => `nocode.json › ${i.path} : ${i.message}`), warnings: [], configIssues: verdict.issues });
  }
  try {
    const code = buildNocodeBundle(verdict.config, { engineVersion: ENGINE_VERSION, engineSource: await deps.engineSource() });
    return done({ ok: true, code, errors: [], warnings: [], config: verdict.config, configJson: serializeNocodeConfig(verdict.config), engineVersion: ENGINE_VERSION });
  } catch (e) {
    const issues = e instanceof NocodeConfigError ? e.issues : undefined;
    return done({ ok: false, errors: [e instanceof Error ? e.message : String(e)], warnings: [], ...(issues ? { configIssues: issues } : {}) });
  }
}

// ── Avec code ───────────────────────────────────────────────────────────────

/** Les options de la CIBLE, recopiées de `targetOptions` (packages/cli/src/build.ts). */
export function targetOptions(): BuildOptions {
  return {
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    charset: 'ascii',
    legalComments: 'none',
    conditions: ['filarr-source'],
    write: false,
    logLevel: 'silent',
  };
}

/** Les chargeurs par défaut d'esbuild, par extension. */
const LOADERS: Record<string, 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'css' | 'text'> = {
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  json: 'json',
  css: 'css',
  txt: 'text',
};
const RESOLVE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json', '.mjs', '.cjs', '.mts', '.cts'];

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function joinPath(base: string, rel: string): string | null {
  const parts = base ? base.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null; // sortir du projet : refusé
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

/** La résolution d'esbuild, sur la carte du projet : chemin exact, extensions, puis `index.*`. */
export function resolveInProject(files: FileMap, path: string): string | null {
  if (files[path]) return path;
  for (const ext of RESOLVE_EXT) if (files[path + ext]) return path + ext;
  // `import './a.js'` qui désigne `a.ts` (convention TypeScript), comme esbuild.
  const m = /^(.*)\.(js|jsx|mjs|cjs)$/.exec(path);
  if (m) for (const ext of ['.ts', '.tsx', '.mts', '.cts']) if (files[m[1] + ext]) return m[1] + ext;
  for (const ext of RESOLVE_EXT) if (files[`${path}/index${ext}`]) return `${path}/index${ext}`;
  return null;
}

export const EMBEDDED_HINT =
  'le Builder n’installe rien depuis le réseau : seuls @filarr/extension-api, @filarr/nocode-engine et yjs y sont embarqués. Pour une autre dépendance, exportez le projet et construisez avec « npx filarr-ext build ».';

function projectPlugin(files: FileMap, modules: Record<string, string>): Plugin {
  return {
    name: 'filarr-projet',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return { path: args.path, namespace: 'projet' };
        const spec = args.path;
        if (spec.startsWith('.') || spec.startsWith('/')) {
          const base = args.namespace === 'projet' ? dirname(args.importer) : '';
          const target = spec.startsWith('/') ? null : joinPath(base, spec);
          const found = target === null ? null : resolveInProject(files, target);
          if (!found) return { errors: [{ text: `fichier introuvable dans le projet : « ${spec} »` }] };
          return { path: found, namespace: 'projet' };
        }
        if (Object.prototype.hasOwnProperty.call(modules, spec)) return { path: spec, namespace: 'embarque' };
        return { errors: [{ text: `« ${spec} » n’est pas disponible : ${EMBEDDED_HINT}` }] };
      });
      b.onLoad({ filter: /.*/, namespace: 'projet' }, (args) => {
        const ext = (/\.([a-z0-9]+)$/i.exec(args.path)?.[1] ?? '').toLowerCase();
        const loader = LOADERS[ext];
        if (!loader) return { errors: [{ text: `aucun chargeur pour « ${args.path} » (extensions permises : ${Object.keys(LOADERS).join(', ')})` }] };
        const bytes = files[args.path];
        const contents = strictText(bytes);
        if (contents === null) return { errors: [{ text: `« ${args.path} » n’est pas du texte UTF-8` }] };
        return { contents, loader, resolveDir: '/' };
      });
      b.onLoad({ filter: /.*/, namespace: 'embarque' }, (args) => ({ contents: modules[args.path], loader: 'js', resolveDir: '/' }));
    },
  };
}

/**
 * `import source from './calcul.worker.ts?worker'` : construit À PART, en IIFE,
 * importé comme TEXTE — la convention de `workerPlugin` de l'outil. Le worker
 * se lance depuis une URL `blob:`, seule source que la CSP de la page permet.
 */
function workerPlugin(esbuild: EsbuildApi, files: FileMap, modules: Record<string, string>, tsconfigRaw: BuildOptions['tsconfigRaw']): Plugin {
  return {
    name: 'filarr-worker-texte',
    setup(b) {
      b.onResolve({ filter: /\?worker$/ }, (args) => {
        const base = args.namespace === 'projet' ? dirname(args.importer) : '';
        const target = joinPath(base, args.path.replace(/\?worker$/, ''));
        const found = target === null ? null : resolveInProject(files, target);
        if (!found) return { errors: [{ text: `worker introuvable dans le projet : « ${args.path} »` }] };
        return { path: found, namespace: 'filarr-worker' };
      });
      b.onLoad({ filter: /.*/, namespace: 'filarr-worker' }, async (args) => {
        const out = await esbuild.build({ ...targetOptions(), ...(tsconfigRaw ? { tsconfigRaw } : {}), entryPoints: [args.path], plugins: [projectPlugin(files, modules)] });
        const code = out.outputFiles?.[0]?.text ?? '';
        const err = syntaxError(code);
        if (err) return { errors: [{ text: `worker ${args.path} : ne se compile pas comme script (${err})` }] };
        return { contents: `export default ${JSON.stringify(code)};`, loader: 'js' };
      });
    },
  };
}

/** Les options de `tsconfig.json`, quand il se lit seul (sans `extends`, qu'on ne peut pas suivre). */
function tsconfigFor(files: FileMap): BuildOptions['tsconfigRaw'] | undefined {
  const b = files['tsconfig.json'];
  if (!b) return undefined;
  try {
    const raw = JSON.parse((strictText(b) ?? '').replace(/^﻿/, '')) as { extends?: unknown; compilerOptions?: Record<string, unknown> };
    if (raw.extends !== undefined || typeof raw.compilerOptions !== 'object') return undefined;
    return { compilerOptions: raw.compilerOptions } as BuildOptions['tsconfigRaw'];
  } catch {
    return undefined;
  }
}

function formatMessage(m: Message): string {
  const file = m.location?.file?.replace(/^(projet|filarr-worker|embarque):/, '');
  return m.location && file ? `${file}:${m.location.line} — ${m.text}` : m.text;
}

export async function buildCode(files: FileMap, project: ProjectDescriptor, deps: BuildDeps): Promise<BuildResult> {
  const t0 = Date.now();
  const done = (r: Omit<BuildResult, 'at' | 'ms' | 'kind'>): BuildResult => ({ ...r, kind: 'code', at: Date.now(), ms: Date.now() - t0 });
  const entry = (project.build as { entry: string }).entry;
  if (!files[entry]) return done({ ok: false, errors: [`point d’entrée introuvable : ${entry}`], warnings: [] });
  try {
    const [esbuild, modules] = await Promise.all([deps.esbuild(), deps.modules()]);
    const tsconfigRaw = tsconfigFor(files);
    const r = await esbuild.build({
      ...targetOptions(),
      ...(tsconfigRaw ? { tsconfigRaw } : {}),
      entryPoints: [entry],
      // Le worker d'abord : son filtre `?worker` doit passer avant la résolution générale.
      plugins: [workerPlugin(esbuild, files, modules, tsconfigRaw), projectPlugin(files, modules)],
    });
    return done({ ok: true, code: r.outputFiles?.[0]?.text ?? '', errors: [], warnings: r.warnings.map(formatMessage) });
  } catch (e) {
    const errs = (e as { errors?: Message[] }).errors;
    return done({ ok: false, errors: errs?.length ? errs.map(formatMessage) : [e instanceof Error ? e.message : String(e)], warnings: [] });
  }
}

export function buildProject(files: FileMap, project: ProjectDescriptor, deps: BuildDeps = browserDeps): Promise<BuildResult> {
  return project.build.kind === 'code' ? buildCode(files, project, deps) : buildNocode(files, project, deps);
}

export { ProjectError };
