/**
 * tocode — « Passer en code » : une extension sans code devient une extension
 * avec code qui monte LE MÊME moteur avec la même configuration. Rien n'est
 * perdu (nocode.json reste), et l'auteur part d'un comportement identique pour
 * l'enrichir. Le paquet déclarera ensuite `build.kind = "code"`.
 */

import { utf8 } from './bytes';
import { updateProjectJson, type FileMap } from './project';

export const TO_CODE_ENTRY = 'src/index.js';

export function toCodeProject(files: FileMap, name: string, configPath = 'nocode.json'): FileMap {
  const rel = `../${configPath}`;
  const src = `/**
 * ${name.replace(/\*\//g, '* /')} — passée en code depuis Filarr Builder.
 *
 * Le moteur sans code reste le moteur : @filarr/nocode-engine lit nocode.json et
 * pose globalThis.filarrSandboxedPlugin, comme la version sans code. À vous
 * d'enrichir le résultat (envelopper mount, ajouter une fonction…).
 */
import { createPlugin } from '@filarr/nocode-engine';
import config from '${rel}';

globalThis.filarrSandboxedPlugin = createPlugin(config);
`;
  const next = updateProjectJson(files, (raw) => {
    raw.build = { kind: 'code', entry: TO_CODE_ENTRY };
  });
  return { ...next, [TO_CODE_ENTRY]: utf8(src) };
}
