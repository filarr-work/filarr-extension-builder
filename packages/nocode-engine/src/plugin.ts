/**
 * plugin — d'une configuration à l'objet `filarrSandboxedPlugin`.
 *
 * La configuration est REVALIDÉE ici, dans la page bac à sable : le bundle a pu
 * être retouché après sa construction, et le moteur n'exécute que ce qu'il a
 * relu lui-même. Une configuration refusée ne fait pas tomber la page : elle
 * donne un éditeur dont `mount` jette un message lisible (le bandeau
 * `mount-error` de Filarr l'affiche tel quel), et des fonctions qui échouent.
 */

import { editorIdsFor, type ExtensionHost, type SandboxedPlugin } from '@filarr/extension-api';
import { makeFunctions } from './functions';
import { validateConfig } from './schema';
import { isPlainObject } from './safe';
import { mountEditor } from './ui/editor';

const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;

export function createPlugin(raw: unknown): SandboxedPlugin {
  const verdict = validateConfig(raw);
  if (!verdict.ok) {
    const first = verdict.issues[0];
    const message = `Configuration sans code invalide — ${first.path} : ${first.message}`.slice(0, 500);
    const fail = (): never => {
      throw new Error(message);
    };
    const id = isPlainObject(raw) && typeof raw.id === 'string' && SLUG_RE.test(raw.id) ? raw.id : 'nocode';
    return {
      editors: editorIdsFor(id).map((editorId) => ({ id: editorId, mount: fail })),
      functions: { extractText: fail, fields: fail, export: fail },
    };
  }
  const config = verdict.config;
  const functions = makeFunctions(config);
  return {
    editors: editorIdsFor(config.id).map((id) => ({
      id,
      mount: (host: ExtensionHost<'editor'>) => mountEditor(host, config),
    })),
    ...(functions ? { functions } : {}),
  };
}
