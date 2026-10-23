/**
 * github — parler à `api.github.com`, et rien qu'à lui. L'adresse des deux
 * requêtes d'un relevé, la lecture de leurs réponses, et le relevé complet.
 *
 * LE SECRET. Le manifeste déclare un secret facultatif, l'en-tête
 * `authorization`. L'utilisateur le saisit DANS FILARR (Mes extensions ›
 * Secrets) ; Filarr le scelle au trousseau de l'appareil et l'AJOUTE lui-même à
 * chaque requête vers `api.github.com`. L'extension ne le voit jamais, ne peut
 * pas le lire, et ne pose jamais cet en-tête : si elle essayait, l'hôte
 * refuserait la requête (`net_header`). Elle ne sait même pas s'il est là —
 * sauf par ses effets : un 401 (jeton refusé), ou une limite de débit plus haute.
 *
 * LES EN-TÊTES qu'elle pose : `accept` et `x-github-api-version`, rien d'autre
 * (`user-agent` est l'affaire du relais).
 */

import type { Releve } from './depots';

export const DOMAINE = 'api.github.com';
export const EN_TETES: Record<string, string> = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
};

const chemin = (nom: string) =>
  nom
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');

export const urlDepot = (nom: string) => `https://${DOMAINE}/repos/${chemin(nom)}`;
export const urlVersion = (nom: string) => `https://${DOMAINE}/repos/${chemin(nom)}/releases/latest`;

export type Echec =
  | { type: 'sans_reseau' }
  | { type: 'reseau'; code: string }
  | { type: 'jeton' }
  | { type: 'limite' }
  | { type: 'introuvable' }
  | { type: 'statut'; statut: number }
  | { type: 'forme' };

function json(octets: Uint8Array): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Un statut d'erreur de GitHub, rangé : jeton refusé, limite atteinte, introuvable. */
export function echecDeStatut(statut: number, octets: Uint8Array): Echec {
  if (statut === 401) return { type: 'jeton' };
  if (statut === 429) return { type: 'limite' };
  if (statut === 403) {
    const message = String(json(octets)?.message ?? '');
    return /rate limit/i.test(message) ? { type: 'limite' } : { type: 'statut', statut };
  }
  if (statut === 404) return { type: 'introuvable' };
  return { type: 'statut', statut };
}

export function lireDepot(statut: number, octets: Uint8Array): { ok: true; etoiles: number; issues: number } | { ok: false; echec: Echec } {
  if (statut !== 200) return { ok: false, echec: echecDeStatut(statut, octets) };
  const b = json(octets);
  const etoiles = b?.stargazers_count;
  const issues = b?.open_issues_count;
  if (typeof etoiles !== 'number' || typeof issues !== 'number') return { ok: false, echec: { type: 'forme' } };
  return { ok: true, etoiles, issues };
}

/** La dernière version ; un 404 veut dire « aucune version publiée », pas une erreur. */
export function lireVersion(statut: number, octets: Uint8Array): { ok: true; version: string | null; publiee: string | null } | { ok: false; echec: Echec } {
  if (statut === 404) return { ok: true, version: null, publiee: null };
  if (statut !== 200) return { ok: false, echec: echecDeStatut(statut, octets) };
  const b = json(octets);
  const version = typeof b?.tag_name === 'string' ? b.tag_name.slice(0, 100) : null;
  const publiee = typeof b?.published_at === 'string' && Number.isFinite(Date.parse(b.published_at)) ? new Date(b.published_at).toISOString() : null;
  return version ? { ok: true, version, publiee } : { ok: false, echec: { type: 'forme' } };
}

const codeDe = (e: unknown) => String((e as { message?: unknown })?.message || 'request_failed');

/**
 * Un relevé complet : deux requêtes, l'une APRÈS l'autre (chacune est montrée
 * à l'utilisateur ; les lancer ensemble lui ferait deux boîtes d'un coup).
 */
export async function releverDepot(host: FilarrHost, nom: string, maintenant: () => Date = () => new Date()): Promise<{ ok: true; releve: Releve } | { ok: false; echec: Echec }> {
  const net = host.network;
  if (!net) return { ok: false, echec: { type: 'sans_reseau' } };
  let r: FilarrNetworkResponse;
  try {
    r = await net.request({ method: 'GET', url: urlDepot(nom), headers: EN_TETES });
  } catch (e) {
    return { ok: false, echec: { type: 'reseau', code: codeDe(e) } };
  }
  const depot = lireDepot(r.status, r.body);
  if (!depot.ok) return depot;
  try {
    r = await net.request({ method: 'GET', url: urlVersion(nom), headers: EN_TETES });
  } catch (e) {
    return { ok: false, echec: { type: 'reseau', code: codeDe(e) } };
  }
  const version = lireVersion(r.status, r.body);
  if (!version.ok) return version;
  return {
    ok: true,
    releve: { etoiles: depot.etoiles, issues: depot.issues, version: version.version, publiee: version.publiee, le: maintenant().toISOString() },
  };
}
