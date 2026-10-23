/**
 * historique — annuler et rétablir, sur des états IMMUABLES. Pur.
 *
 * Chaque geste produit un nouveau `Croquis` qui partage ses traits avec le
 * précédent (un trait ajouté ne recopie pas les autres) : garder deux cents
 * états coûte deux cents tableaux de références, pas deux cents dessins.
 *
 * L'historique vit en mémoire, le temps de l'ouverture : il n'est pas écrit
 * dans le fichier. Rouvrir le croquis repart d'un historique vide — c'est ce
 * qu'attend quelqu'un qui partage un dessin.
 */

import type { Croquis, Trait } from './croquis';

export const PROFONDEUR = 200;

export interface Historique {
  readonly present: Croquis;
  readonly passe: readonly Croquis[];
  readonly futur: readonly Croquis[];
}

export function historique(present: Croquis): Historique {
  return { present, passe: [], futur: [] };
}

export function appliquer(h: Historique, suivant: Croquis): Historique {
  if (suivant === h.present) return h;
  return { present: suivant, passe: [...h.passe, h.present].slice(-PROFONDEUR), futur: [] };
}

export function annuler(h: Historique): Historique {
  if (h.passe.length === 0) return h;
  return { present: h.passe[h.passe.length - 1], passe: h.passe.slice(0, -1), futur: [h.present, ...h.futur] };
}

export function retablir(h: Historique): Historique {
  if (h.futur.length === 0) return h;
  return { present: h.futur[0], passe: [...h.passe, h.present], futur: h.futur.slice(1) };
}

export function ajouterTrait(c: Croquis, t: Trait): Croquis {
  return { ...c, traits: [...c.traits, t] };
}

/** Tout effacer est UN geste : il s'annule d'un coup. */
export function effacerTout(c: Croquis): Croquis {
  return c.traits.length === 0 ? c : { ...c, traits: [] };
}
