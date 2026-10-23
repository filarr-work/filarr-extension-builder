/**
 * client — une prévision, par `host.network`, avec tous ses refus.
 *
 * `host.network` n'existe que si la capacité a été déclarée ET acceptée ; sur
 * le web, il existe mais rend `unavailable` (le relais réseau n'est posé que
 * dans l'application de bureau). Chaque requête est MONTRÉE à l'utilisateur
 * par Filarr avant de partir — il peut la refuser (`net_refused`), ou bloquer
 * l'extension pour la session. Tout cela n'est pas une panne de l'extension :
 * c'est le contrat, et chaque cas a son message.
 *
 * Aucun en-tête n'est posé : `Accept` et `User-Agent` sont l'affaire du relais,
 * et l'API d'Open-Meteo ne demande pas de clé.
 */

import { codeDeRejet } from './sauvegarde';
import { lireReponse, urlPrevision, type Meteo } from './openmeteo';

export type Resultat =
  | { ok: true; meteo: Meteo }
  | { ok: false; type: 'sans_reseau' }
  | { ok: false; type: 'reseau'; code: string }
  | { ok: false; type: 'statut'; statut: number }
  | { ok: false; type: 'forme' };

export async function demanderMeteo(host: FilarrHost, lat: number, lon: number): Promise<Resultat> {
  if (!host.network) return { ok: false, type: 'sans_reseau' };
  let reponse: FilarrNetworkResponse;
  try {
    reponse = await host.network.request({ method: 'GET', url: urlPrevision(lat, lon) });
  } catch (e) {
    return { ok: false, type: 'reseau', code: codeDeRejet(e) };
  }
  const lu = lireReponse(reponse.status, reponse.body);
  if (lu.ok) return { ok: true, meteo: lu.meteo };
  return lu.raison === 'statut' ? { ok: false, type: 'statut', statut: lu.statut } : { ok: false, type: 'forme' };
}
