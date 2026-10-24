/**
 * required — les champs que l'auteur déclare « obligatoires ».
 *
 * Le moteur sans code n'a PAS cette notion (sa configuration est une liste
 * fermée, et un fichier qui n'a pas un champ s'ouvre avec ce champ vide). Le
 * Builder ne l'ajoute donc pas à `nocode.json` : il la garde dans
 * `.filarr-builder.json` et s'en sert pour vérifier que vos fichiers d'exemple
 * portent bien ces champs — une aide à l'auteur, pas une garantie du moteur.
 */

import type { NocodeConfig } from '@filarr/nocode-engine';
import { strictText } from './bytes';
import type { FileMap } from './project';
import { detectDelimiter, parseCsv, parseKeyValue } from './textformats';

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function checkRequired(
  files: FileMap,
  samples: { name: string; path: string }[],
  config: NocodeConfig,
  required: Record<string, boolean>
): { path: string; message: string }[] {
  const paths = Object.keys(required).filter((k) => required[k]);
  if (paths.length === 0) return [];
  const out: { path: string; message: string }[] = [];
  for (const s of samples) {
    const t = strictText(files[s.path]);
    if (t === null) continue;
    const missing: string[] = [];
    try {
      if (config.format.type === 'json') {
        const doc = JSON.parse(t) as Record<string, unknown>;
        for (const p of paths) {
          const [head, sub] = p.split('[].');
          if (sub === undefined) {
            if (empty(doc[head])) missing.push(p);
          } else if (Array.isArray(doc[head]) && (doc[head] as Record<string, unknown>[]).some((it) => !it || empty(it[sub]))) missing.push(p);
        }
      } else if (config.format.type === 'csv') {
        const rows = parseCsv(t, config.format.delimiter ?? detectDelimiter(t.split(/\r?\n/)[0] ?? ''));
        const header = rows[0] ?? [];
        for (const p of paths) {
          const col = header.indexOf(p);
          if (col < 0 || rows.slice(1).some((r) => (r[col] ?? '') === '')) missing.push(p);
        }
      } else if (config.format.type === 'keyvalue') {
        const pairs = parseKeyValue(t, config.format.separator ?? ':');
        for (const p of paths) if (!pairs.some((x) => x.key === p && x.value !== '')) missing.push(p);
      }
    } catch {
      continue; // illisible : « sample_unreadable » le dit déjà
    }
    if (missing.length) out.push({ path: s.path, message: `l’exemple ${s.name} n’a pas de valeur pour ${missing.join(', ')}, déclaré${missing.length > 1 ? 's' : ''} obligatoire${missing.length > 1 ? 's' : ''}` });
  }
  return out;
}
