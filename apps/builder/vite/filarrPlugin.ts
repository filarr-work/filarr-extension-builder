/**
 * filarrPlugin — ce que l'atelier embarque au lieu de le télécharger.
 *
 * Le Builder ne fait AUCUN appel réseau hors de sa propre origine : pas de
 * CDN, pas de police distante, pas de paquet npm tiré au vol. Tout ce dont il a
 * besoin est donc fabriqué ici, au build (et à la demande en développement) :
 *
 *  · `virtual:filarr/engine`   — le moteur sans code, construit par le MÊME
 *    script que `filarr-ext` (`nocode-engine/scripts/engine.mjs`) : un bundle
 *    sans code fabriqué dans le navigateur est identique à celui de l'outil ;
 *  · `virtual:filarr/modules`  — les seules dépendances qu'un projet avec code
 *    peut importer dans le Builder (`@filarr/extension-api`,
 *    `@filarr/nocode-engine`, `yjs`), pré-assemblées en ESM ;
 *  · `virtual:filarr/examples` — les vingt exemples du dépôt, en mémoire ;
 *  · `plugin-sandbox.html`     — la page bac à sable de Filarr, copiée OCTET
 *    POUR OCTET (sa CSP n'admet que l'empreinte de son script), servie avec les
 *    en-têtes de Filarr ;
 *  · la CSP de l'atelier, en en-tête (`_headers`, aperçu) et en `<meta>` (pour
 *    tout hébergeur statique qui ignorerait `_headers`).
 */

import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
// Les sources, pas `dist/` : la page servie et ses empreintes ne peuvent pas dériver l'une de l'autre.
import { sandboxHeaders } from '../../../packages/devhost/src/server';
import { buildEngineSource } from '../../../packages/nocode-engine/scripts/engine.mjs';

const REPO = resolve(__dirname, '..', '..', '..');
const SANDBOX_PAGE = join(REPO, 'packages', 'devhost', 'vendor', 'plugin-sandbox.html');

/**
 * La CSP de l'atelier. Pas d'`unsafe-eval` : l'atelier ne compile ni n'exécute
 * jamais le code de l'auteur (les contrôles le LISENT avec un analyseur, la page
 * bac à sable l'exécute). `wasm-unsafe-eval` : esbuild-wasm compile son
 * WebAssembly, rien d'autre. `blob:` en worker : esbuild-wasm lance son worker
 * depuis une URL blob. Aucune origine tierce, nulle part.
 */
export const ATELIER_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'self'",
];

/** En en-tête seulement : `frame-ancestors` est ignoré dans une balise `<meta>`. */
export const ATELIER_CSP = [...ATELIER_CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ');

const COMMON_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Pas de Cross-Origin-Opener-Policy « same-origin » : « Ouvrir dans Filarr »
  // a besoin que la fenêtre de Filarr garde `window.opener` (PACKAGE.md §5).
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function sandboxPage(): Buffer {
  return readFileSync(SANDBOX_PAGE);
}

// ── Les exemples ────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.git']);
const SKIP_FILES = new Set(['smoke.json']);

interface ExampleFile {
  path: string;
  text?: string;
  base64?: string;
}

function walk(dir: string, root: string, out: ExampleFile[]): void {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs, root, out);
      continue;
    }
    if (SKIP_FILES.has(name)) continue;
    const rel = relative(root, abs).split(sep).join('/');
    const bytes = readFileSync(abs);
    let text: string | null = null;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
    // Les images d'exemple sont du binaire même quand elles se décodent par hasard.
    if (text !== null && !/\.(png|jpe?g|webp|gif|bin)$/i.test(name)) out.push({ path: rel, text });
    else out.push({ path: rel, base64: bytes.toString('base64') });
  }
}

/** Les vingt exemples, tels qu'un projet du Builder les attend. */
export function collectExamples(): { kind: 'code' | 'nocode'; slug: string; files: ExampleFile[] }[] {
  const out: { kind: 'code' | 'nocode'; slug: string; files: ExampleFile[] }[] = [];
  const typesFile = join(REPO, 'examples', 'code', '_outils', '_types', 'filarr.d.ts');
  for (const kind of ['nocode', 'code'] as const) {
    const base = join(REPO, 'examples', kind);
    if (!existsSync(base)) continue;
    for (const slug of readdirSync(base).sort()) {
      const dir = join(base, slug);
      if (slug.startsWith('_') || slug.startsWith('.') || !statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, 'filarr.extension.json'))) continue;
      const files: ExampleFile[] = [];
      walk(dir, dir, files);
      // Les exemples avec code s'appuient sur `_outils` du dépôt : on rend le projet autonome
      // (ses types globaux recopiés, un tsconfig qui ne pointe plus hors du projet).
      if (kind === 'code' && existsSync(typesFile)) {
        const i = files.findIndex((f) => f.path === 'tsconfig.json');
        if (i >= 0) {
          // Le tsconfig de l'exemple étend `_outils/tsconfig.base.json` : on le résout ici, pour
          // qu'esbuild lise les mêmes options que `filarr-ext` dans le dépôt (verbatimModuleSyntax…).
          const base = JSON.parse(readFileSync(join(REPO, 'examples', 'code', '_outils', 'tsconfig.base.json'), 'utf8'));
          const own = JSON.parse(files[i].text ?? '{}');
          const merged = {
            compilerOptions: { ...base.compilerOptions, ...(own.compilerOptions ?? {}) },
            include: ['src'],
            exclude: ['src/__tests__'],
          };
          files[i] = { path: 'tsconfig.json', text: `${JSON.stringify(merged, null, 2)}\n` };
        }
        files.push({ path: 'src/filarr.d.ts', text: readFileSync(typesFile, 'utf8') });
      }
      out.push({ kind, slug, files });
    }
  }
  return out;
}

// ── Les modules embarqués pour les projets avec code ────────────────────────

async function esm(entry: string, resolveDir?: string): Promise<string> {
  const r = await build({
    ...(resolveDir
      ? { stdin: { contents: entry, resolveDir, loader: 'ts' as const } }
      : { entryPoints: [entry] }),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    conditions: ['filarr-source'],
    mainFields: ['module', 'main'],
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

export async function embeddedModules(): Promise<Record<string, string>> {
  return {
    '@filarr/extension-api': await esm(join(REPO, 'packages', 'extension-api', 'src', 'index.ts')),
    '@filarr/nocode-engine': await esm(join(REPO, 'packages', 'nocode-engine', 'src', 'index.ts')),
    yjs: await esm(`export * from 'yjs';`, join(REPO, 'apps', 'builder')),
  };
}

// ── Le greffon ──────────────────────────────────────────────────────────────

const VIRTUAL = ['virtual:filarr/engine', 'virtual:filarr/modules', 'virtual:filarr/examples'] as const;

function headersFile(): string {
  const sandbox = sandboxHeaders(sandboxPage().toString('utf8'));
  const lines: string[] = [];
  const block = (path: string, headers: Record<string, string>) => {
    lines.push(path);
    for (const [k, v] of Object.entries(headers)) lines.push(`  ${k}: ${v}`);
    lines.push('');
  };
  // Une règle par document : deux CSP qui se cumuleraient sur la page bac à sable la casseraient.
  block('/', { 'Content-Security-Policy': ATELIER_CSP, 'X-Frame-Options': 'DENY' });
  block('/index.html', { 'Content-Security-Policy': ATELIER_CSP, 'X-Frame-Options': 'DENY' });
  block('/plugin-sandbox.html', sandbox);
  // Cloudflare Pages redirige `/plugin-sandbox.html` (308) vers `/plugin-sandbox` et sert
  // la page À CETTE ADRESSE : sans cette règle, elle partait sans sa CSP d'en-tête
  // (vérifié sur filarr-builder.pages.dev le 2026-10-26).
  block('/plugin-sandbox', sandbox);
  block('/*', COMMON_HEADERS);
  return lines.join('\n');
}

function serveHeaders(server: ViteDevServer | PreviewServer, withAtelierCsp: boolean): void {
  server.middlewares.use((req, res, next) => {
    const path = (req.url ?? '/').split('?')[0];
    for (const [k, v] of Object.entries(COMMON_HEADERS)) res.setHeader(k, v);
    if (path === '/plugin-sandbox.html') {
      const page = sandboxPage();
      const headers = sandboxHeaders(page.toString('utf8'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.end(page);
      return;
    }
    if (withAtelierCsp && (path === '/' || path === '/index.html')) {
      res.setHeader('Content-Security-Policy', ATELIER_CSP);
      res.setHeader('X-Frame-Options', 'DENY');
    }
    next();
  });
}

export function filarrPlugin(): Plugin {
  let engineP: Promise<string> | null = null;
  let modulesP: Promise<Record<string, string>> | null = null;
  return {
    name: 'filarr-builder',
    resolveId(id) {
      return (VIRTUAL as readonly string[]).includes(id) ? `\0${id}` : null;
    },
    async load(id) {
      if (id === '\0virtual:filarr/engine') {
        engineP ??= buildEngineSource() as Promise<string>;
        return `export const ENGINE_SOURCE = ${JSON.stringify(await engineP)};`;
      }
      if (id === '\0virtual:filarr/modules') {
        modulesP ??= embeddedModules();
        return `export default ${JSON.stringify(await modulesP)};`;
      }
      if (id === '\0virtual:filarr/examples') {
        return `export default ${JSON.stringify(collectExamples())};`;
      }
      return null;
    },
    configureServer(server) {
      // En développement, Vite injecte du script en ligne : la CSP stricte n'est posée qu'au build et à l'aperçu.
      serveHeaders(server, false);
    },
    configurePreviewServer(server) {
      serveHeaders(server, true);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html;
        const meta = `<meta http-equiv="Content-Security-Policy" content="${ATELIER_CSP_DIRECTIVES.join('; ')}" />`;
        return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    ${meta}`);
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'plugin-sandbox.html', source: new Uint8Array(sandboxPage()) });
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}
