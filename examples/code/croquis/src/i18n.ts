/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`).
 */

import type { TextesEtat } from './etat';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  outils: string;
  couleurs: string;
  nomsCouleurs: Record<string, string>;
  epaisseur: string;
  annuler: string;
  retablir: string;
  effacer: string;
  toile: (n: number) => string;
  aide: string;
  crayonPose: string;
  traitFini: (points: number) => string;
  traitAnnule: string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    outils: 'Outils de dessin',
    couleurs: 'Couleur du crayon',
    nomsCouleurs: {
      '#1f2937': 'encre',
      '#dc2626': 'rouge',
      '#ea580c': 'orange',
      '#ca8a04': 'jaune',
      '#16a34a': 'vert',
      '#2563eb': 'bleu',
      '#7c3aed': 'violet',
      '#ffffff': 'blanc',
    },
    epaisseur: 'Épaisseur',
    annuler: 'Annuler (Ctrl+Z)',
    retablir: 'Rétablir (Ctrl+Maj+Z)',
    effacer: 'Tout effacer',
    toile: (n) => `Zone de dessin, ${n} trait${n > 1 ? 's' : ''}`,
    aide:
      'Dessinez à la souris, au stylet ou au doigt. Au clavier : flèches pour déplacer le crayon (Maj : plus vite, Alt : au pixel), Entrée pour le poser puis le lever, Échap pour abandonner le trait.',
    crayonPose: 'Crayon posé',
    traitFini: (n) => `Trait terminé, ${n} point${n > 1 ? 's' : ''}`,
    traitAnnule: 'Trait abandonné',
    illisible: "Ce fichier n'est pas un croquis lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Ce croquis a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des traits mal formés ont été corrigés ; ils seront réécrits au prochain enregistrement.',
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ce croquis a été enregistré ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-le.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    outils: 'Drawing tools',
    couleurs: 'Pen colour',
    nomsCouleurs: {
      '#1f2937': 'ink',
      '#dc2626': 'red',
      '#ea580c': 'orange',
      '#ca8a04': 'yellow',
      '#16a34a': 'green',
      '#2563eb': 'blue',
      '#7c3aed': 'purple',
      '#ffffff': 'white',
    },
    epaisseur: 'Thickness',
    annuler: 'Undo (Ctrl+Z)',
    retablir: 'Redo (Ctrl+Shift+Z)',
    effacer: 'Clear all',
    toile: (n) => `Drawing area, ${n} stroke${n === 1 ? '' : 's'}`,
    aide:
      'Draw with a mouse, pen or finger. With the keyboard: arrows move the pen (Shift: faster, Alt: one pixel), Enter puts it down then lifts it, Escape drops the stroke.',
    crayonPose: 'Pen down',
    traitFini: (n) => `Stroke finished, ${n} point${n === 1 ? '' : 's'}`,
    traitAnnule: 'Stroke dropped',
    illisible: 'This file is not a readable sketch. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This sketch was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed strokes were fixed; they will be rewritten on the next save.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit:
      'Conflict: this sketch was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};
