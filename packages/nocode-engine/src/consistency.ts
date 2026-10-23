/**
 * consistency — une configuration sans code et son manifeste disent-ils la
 * même chose ?
 *
 * Le manifeste est ce que l'utilisateur ACCEPTE (signé, montré au
 * consentement) ; la configuration est ce que le moteur FAIT. Un écart entre
 * les deux se paie de deux façons : une fonction déclarée que le moteur
 * n'offre pas (Filarr l'appelle, elle échoue), ou une capacité demandée dont
 * le moteur n'a pas l'usage (l'utilisateur consent à quelque chose pour rien).
 */

import type { ExtensionManifest, Issue } from '@filarr/extension-api';
import { openDocument } from './formats/index';
import { functionFieldTypes } from './schema';
import { MAX_DOCUMENT_BYTES } from './safe';
import type { NocodeConfig } from './types';

/** Les capacités dont le moteur sans code n'a aucun usage. */
const UNUSED_BY_ENGINE = ['storage', 'collab', 'picker', 'noteBlock', 'homeWidget', 'network'] as const;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function checkNocodeAgainstManifest(config: NocodeConfig, manifest: ExtensionManifest): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, code: string, message: string) => issues.push({ level: 'error', code, field, message });
  const warn = (field: string, code: string, message: string) => issues.push({ level: 'warning', code, field, message });

  if (config.id !== manifest.id) {
    err('nocode.id', 'nocode_id_mismatch', `nocode.json dit « ${config.id} », le manifeste « ${manifest.id} » : l’éditeur ne serait pas trouvé (sandbox_editor_not_found)`);
  }
  const caps = manifest.capabilities ?? {};
  for (const k of UNUSED_BY_ENGINE) {
    if (caps[k] !== undefined) {
      err(`manifest.capabilities.${k}`, 'nocode_unused_capability', `le moteur sans code n’utilise pas « ${k} » : ne la demandez pas à l’utilisateur`);
    }
  }
  const fn = caps.functions;
  const cf = config.functions;
  if (fn?.thumbnail) err('manifest.capabilities.functions.thumbnail', 'nocode_no_thumbnail', 'le moteur sans code ne fabrique pas de vignette');
  if (fn?.extractText && !cf?.extractText) {
    err('manifest.capabilities.functions.extractText', 'nocode_function_missing', 'extractText est déclarée au manifeste mais pas dans nocode.json (functions.extractText)');
  }
  if (!fn?.extractText && cf?.extractText) {
    warn('nocode.functions.extractText', 'nocode_function_undeclared', 'extractText est dans nocode.json mais pas au manifeste : Filarr ne l’appellera pas');
  }
  const declared = fn?.fields ?? [];
  const offered = cf?.fields ? functionFieldTypes(config) : [];
  for (const d of declared) {
    const o = offered.find((x) => x.key === d.key);
    if (!o) err('manifest.capabilities.functions.fields', 'nocode_field_missing', `la colonne « ${d.key} » est déclarée au manifeste mais nocode.json ne la calcule pas`);
    else if (o.type !== d.type) err('manifest.capabilities.functions.fields', 'nocode_field_type', `la colonne « ${d.key} » : le manifeste dit ${d.type}, nocode.json rend ${o.type}`);
  }
  for (const o of offered) {
    if (!declared.some((d) => d.key === o.key)) {
      warn('nocode.functions.fields', 'nocode_field_undeclared', `la colonne « ${o.key} » n’est pas au manifeste : Filarr l’écartera (déclarez { key: "${o.key}", label, type: "${o.type}" })`);
    }
  }
  const exportsDeclared = fn?.exports ?? [];
  const exportsOffered = cf?.exports ?? [];
  for (const e of exportsDeclared) {
    if (!exportsOffered.some((x) => x.to === e.to)) err('manifest.capabilities.functions.exports', 'nocode_export_missing', `l’export ${e.to} est déclaré au manifeste mais pas dans nocode.json`);
  }
  for (const e of exportsOffered) {
    if (!exportsDeclared.some((x) => x.to === e.to)) warn('nocode.functions.exports', 'nocode_export_undeclared', `l’export ${e.to} n’est pas au manifeste : Filarr ne le proposera pas`);
  }
  if (caps.maxBytes !== undefined && caps.maxBytes > MAX_DOCUMENT_BYTES) {
    warn('manifest.capabilities.maxBytes', 'nocode_max_bytes', 'le moteur sans code refuse d’ouvrir un fichier de plus de 8 Mio');
  }
  (caps.newDocument ?? []).forEach((offre, i) => {
    if (offre.seed === undefined) return;
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(offre.seed);
    } catch {
      return; // le validateur de capacités l'a déjà refusée
    }
    const r = openDocument(bytes, config);
    if (!r.ok) err(`manifest.capabilities.newDocument[${i}].seed`, 'nocode_seed_unreadable', `le modèle de départ ne s’ouvre pas avec cette configuration (${r.code}${r.detail ? ` : ${r.detail}` : ''})`);
  });
  return issues;
}
