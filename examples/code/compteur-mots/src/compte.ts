/**
 * compte — mots, caractères et temps de lecture d'un texte. Pur : aucune
 * dépendance au DOM, testé tel quel.
 *
 * Un MOT est une suite de lettres, chiffres ou marques combinantes, que
 * peuvent lier une apostrophe, un trait d'union ou un point (« aujourd'hui »,
 * « porte-monnaie », « 3.14 » comptent pour un). C'est la règle des
 * traitements de texte usuels, et elle est la même sur toutes les plateformes —
 * `Intl.Segmenter` en mode « mot » varie d'un moteur à l'autre.
 *
 * Un CARACTÈRE est un graphème (ce que l'œil voit) : « 👍🏽 » ou « é » écrit avec
 * un accent combinant comptent pour un. Sans `Intl.Segmenter`, on se replie
 * sur les points de code.
 */

export interface Compte {
  mots: number;
  caracteres: number;
  caracteresSansEspaces: number;
  /** Arrondi à la minute ; 1 dès qu'il y a un mot, 0 pour un texte vide. */
  minutesLecture: number;
}

/** Vitesse de lecture silencieuse d'un adulte, en mots par minute. */
export const MOTS_PAR_MINUTE = 230;

const MOT_RE = /[\p{L}\p{N}\p{M}]+(?:['’\-‐.][\p{L}\p{N}\p{M}]+)*/gu;

interface SegmenteurGraphemes {
  segment(texte: string): Iterable<unknown>;
}

function segmenteur(): SegmenteurGraphemes | null {
  const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => SegmenteurGraphemes })
    .Segmenter;
  return S ? new S(undefined, { granularity: 'grapheme' }) : null;
}

export function graphemes(texte: string): number {
  const s = segmenteur();
  if (!s) return [...texte].length;
  return Array.from(s.segment(texte)).length;
}

export function compterMots(texte: string): number {
  return (texte.match(MOT_RE) ?? []).length;
}

export function compter(texte: string): Compte {
  const mots = compterMots(texte);
  return {
    mots,
    caracteres: graphemes(texte),
    caracteresSansEspaces: graphemes(texte.replace(/\s+/gu, '')),
    minutesLecture: mots === 0 ? 0 : Math.max(1, Math.round(mots / MOTS_PAR_MINUTE)),
  };
}
