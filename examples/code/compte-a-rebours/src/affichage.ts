/**
 * affichage — le texte d'un compte à rebours, et une horloge UNIQUE pour tous.
 *
 * Une seule minuterie par page, quel que soit le nombre d'évènements : chaque
 * seconde, on récrit le texte des comptes visibles. Elle est arrêtée par
 * `destroy()` — une minuterie oubliée continuerait de tourner dans une page que
 * l'hôte croit fermée.
 *
 * Les comptes ne sont PAS dans une région `aria-live` : un lecteur d'écran qui
 * annoncerait chaque seconde rendrait la page inutilisable. Le texte est là
 * quand on y arrive ; la date exacte est dans `<time datetime>`.
 */

import { depuis, type Langue, type Textes } from './i18n';
import { ecart, formatCompte } from './rebours';

export function texteCompte(iso: string | null, maintenant: number, t: Textes, langue: Langue): string {
  if (!iso) return '';
  const e = ecart(maintenant, Date.parse(iso));
  if (e.total < 1000) return t.maintenant;
  return e.passe ? depuis(e.total, langue) : t.dans(formatCompte(e, langue));
}

export function dateLisible(iso: string, langue: Langue): string {
  return new Date(iso).toLocaleString(langue, { dateStyle: 'full', timeStyle: 'short' });
}

export interface Horloge {
  arreter(): void;
}

/** Appelle `tic` maintenant, puis chaque seconde. */
export function demarrerHorloge(tic: (maintenant: number) => void): Horloge {
  tic(Date.now());
  const id = setInterval(() => tic(Date.now()), 1000);
  return { arreter: () => clearInterval(id) };
}
