/**
 * helpers — les dépendances de la construction, sous Node : le moteur et les
 * modules embarqués fabriqués par le greffon Vite, esbuild-wasm (le même
 * WebAssembly que dans le navigateur, chargé par son point d'entrée Node).
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildEngineSource } from '../../../packages/nocode-engine/scripts/engine.mjs';
import { collectExamples, embeddedModules } from '../vite/filarrPlugin';
import type { BuildDeps, EsbuildApi } from '../src/lib/build';
import { fromBase64, utf8 } from '../src/lib/bytes';
import type { FileMap } from '../src/lib/project';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const exampleDir = (kind: 'code' | 'nocode', slug: string) => join(REPO, 'examples', kind, slug);

let engine: Promise<string> | null = null;
let modules: Promise<Record<string, string>> | null = null;

export const nodeDeps: BuildDeps = {
  engineSource: () => (engine ??= buildEngineSource() as Promise<string>),
  modules: () => (modules ??= embeddedModules()),
  esbuild: async () => (await import('esbuild-wasm')) as unknown as EsbuildApi,
};

/** Un exemple du dépôt, tel que le Builder le reçoit (projet rendu autonome). */
export function exampleFiles(kind: 'code' | 'nocode', slug: string): FileMap {
  const rec = collectExamples().find((e) => e.kind === kind && e.slug === slug);
  if (!rec) throw new Error(`exemple ${kind}/${slug} introuvable`);
  const files: FileMap = {};
  for (const f of rec.files) files[f.path] = f.text !== undefined ? utf8(f.text) : fromBase64(f.base64 ?? '');
  return files;
}
