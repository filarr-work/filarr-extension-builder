/**
 * i18n — l'extension a SA langue, et la prend de `host.locale`.
 *
 * L'hôte ne traduit rien pour nous : ses rejets sont des CODES, et ses textes
 * ne nous parviennent jamais. Français si Filarr est en français, anglais
 * sinon (la langue la mieux partagée pour toute autre locale).
 */

import type { TextesEtat } from './etat';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  zone: string;
  stats: (mots: number, caracteres: number, minutes: number) => string;
  detail: (sansEspaces: number) => string;
  illisible: string;
}

const pluriel = (n: number, un: string, plusieurs: string, langue: Langue) =>
  (langue === 'fr' ? n < 2 : n === 1) ? un : plusieurs;

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    zone: 'Texte',
    stats: (m, c, min) =>
      `${m} ${pluriel(m, 'mot', 'mots', 'fr')} · ${c} ${pluriel(c, 'caractère', 'caractères', 'fr')} · ` +
      (min === 0 ? 'rien à lire' : `${min} min de lecture`),
    detail: (n) => `${n} ${pluriel(n, 'caractère', 'caractères', 'fr')} sans les espaces`,
    illisible:
      "Ce fichier n'est pas du texte UTF-8. Il est laissé intact : rien ne sera enregistré.",
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ce document a été enregistré ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-le.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    zone: 'Text',
    stats: (m, c, min) =>
      `${m} ${pluriel(m, 'word', 'words', 'en')} · ${c} ${pluriel(c, 'character', 'characters', 'en')} · ` +
      (min === 0 ? 'nothing to read' : `${min} min read`),
    detail: (n) => `${n} ${pluriel(n, 'character', 'characters', 'en')} without spaces`,
    illisible: 'This file is not UTF-8 text. It is left untouched: nothing will be saved.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit:
      'Conflict: this document was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};
