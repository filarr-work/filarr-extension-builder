/**
 * operations — modifier une liste de sous-titres, et dire ce qui cloche. Pur.
 *
 * Chaque opération rend une NOUVELLE liste. La validation ne corrige rien en
 * silence : un sous-titre qui finit avant de commencer, ou qui chevauche le
 * suivant, est SIGNALÉ (le lecteur vidéo l'affichera mal), et c'est à
 * l'utilisateur de trancher — un chevauchement peut être voulu (deux
 * personnes qui parlent en même temps).
 */

import { nettoyerTexte, SOUS_TITRES_MAX, type SousTitre } from './srt';

export const DUREE_DEFAUT_MS = 2000;
export const ECART_DEFAUT_MS = 200;

export type Probleme = 'fin_avant_debut' | 'chevauche_suivant' | null;

export function probleme(liste: SousTitre[], i: number): Probleme {
  const s = liste[i];
  if (s.fin <= s.debut) return 'fin_avant_debut';
  const suivant = liste[i + 1];
  if (suivant && suivant.debut < s.fin) return 'chevauche_suivant';
  return null;
}

/** Insère un sous-titre après `i` (-1 : au début), dans le trou qui suit. */
export function inserer(liste: SousTitre[], i: number): { liste: SousTitre[]; index: number } {
  if (liste.length >= SOUS_TITRES_MAX) return { liste, index: i };
  const avant = liste[i];
  const apres = liste[i + 1];
  const debut = avant ? avant.fin + ECART_DEFAUT_MS : 0;
  const fin = apres ? Math.max(debut + 1, Math.min(debut + DUREE_DEFAUT_MS, apres.debut - ECART_DEFAUT_MS)) : debut + DUREE_DEFAUT_MS;
  const neuf: SousTitre = { debut, fin, texte: '' };
  return { liste: [...liste.slice(0, i + 1), neuf, ...liste.slice(i + 1)], index: i + 1 };
}

export function supprimer(liste: SousTitre[], i: number): SousTitre[] {
  return liste.filter((_, j) => j !== i);
}

export function modifier(liste: SousTitre[], i: number, champ: Partial<SousTitre>): SousTitre[] {
  return liste.map((s, j) =>
    j === i
      ? {
          debut: champ.debut ?? s.debut,
          fin: champ.fin ?? s.fin,
          texte: champ.texte !== undefined ? nettoyerTexte(champ.texte) : s.texte,
        }
      : s
  );
}

/** Décale tout de `ms` (négatif : avance), sans jamais passer sous zéro. */
export function decaler(liste: SousTitre[], ms: number): SousTitre[] {
  if (!Number.isFinite(ms) || ms === 0) return liste;
  return liste.map((s) => {
    const duree = s.fin - s.debut;
    const debut = Math.max(0, s.debut + Math.round(ms));
    return { ...s, debut, fin: Math.max(debut, debut + duree) };
  });
}

/** Remet la liste dans l'ordre des temps de début (stable pour les égalités). */
export function trier(liste: SousTitre[]): SousTitre[] {
  return liste
    .map((s, i) => [s, i] as const)
    .sort((a, b) => a[0].debut - b[0].debut || a[1] - b[1])
    .map(([s]) => s);
}

export function estTrie(liste: SousTitre[]): boolean {
  return liste.every((s, i) => i === 0 || liste[i - 1].debut <= s.debut);
}
