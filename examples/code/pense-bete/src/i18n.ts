/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`).
 */

import type { TextesEtat } from './etat';
import type { Couleur } from './postit';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  ajouter: string;
  zoomMoins: string;
  zoomPlus: string;
  zoom: (pourcent: number) => string;
  tableau: string;
  note: (resume: string) => string;
  noteVide: string;
  texteNote: string;
  couleur: (c: string) => string;
  couleurs: Record<Couleur, string>;
  replier: string;
  deplier: string;
  supprimer: string;
  aide: string;
  deplacee: (x: number, y: number) => string;
  ajoutee: string;
  supprimee: string;
  vide: string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
  prefsPanne: (code: string) => string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    ajouter: 'Nouvelle note',
    zoomMoins: 'Dézoomer',
    zoomPlus: 'Zoomer',
    zoom: (p) => `${p} %`,
    tableau: 'Tableau de notes',
    note: (r) => `Note : ${r}`,
    noteVide: 'Note vide',
    texteNote: 'Texte de la note',
    couleur: (c) => `Couleur : ${c}. Changer`,
    couleurs: { jaune: 'jaune', rose: 'rose', bleu: 'bleu', vert: 'vert', orange: 'orange', violet: 'violet' },
    replier: 'Replier la note',
    deplier: 'Déplier la note',
    supprimer: 'Supprimer la note',
    aide: 'Flèches : déplacer la note (Maj : plus vite). Entrée : écrire. Échap : revenir à la note. Suppr : supprimer.',
    deplacee: (x, y) => `Note déplacée en ${x}, ${y}`,
    ajoutee: 'Note ajoutée',
    supprimee: 'Note supprimée',
    vide: 'Aucune note. « Nouvelle note » pour commencer.',
    illisible: "Ce fichier n'est pas un tableau de notes lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) =>
      `Ce tableau a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des notes mal formées ont été corrigées ; elles seront réécrites au prochain enregistrement.',
    prefsPanne: (code) => `Préférences d'affichage non gardées (${code})`,
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ce tableau a été enregistré ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-le.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    ajouter: 'New note',
    zoomMoins: 'Zoom out',
    zoomPlus: 'Zoom in',
    zoom: (p) => `${p}%`,
    tableau: 'Note board',
    note: (r) => `Note: ${r}`,
    noteVide: 'Empty note',
    texteNote: 'Note text',
    couleur: (c) => `Colour: ${c}. Change`,
    couleurs: { jaune: 'yellow', rose: 'pink', bleu: 'blue', vert: 'green', orange: 'orange', violet: 'purple' },
    replier: 'Collapse note',
    deplier: 'Expand note',
    supprimer: 'Delete note',
    aide: 'Arrows: move the note (Shift: faster). Enter: write. Escape: back to the note. Delete: remove.',
    deplacee: (x, y) => `Note moved to ${x}, ${y}`,
    ajoutee: 'Note added',
    supprimee: 'Note deleted',
    vide: 'No notes yet. Use “New note” to start.',
    illisible: 'This file is not a readable note board. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This board was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed notes were fixed; they will be rewritten on the next save.',
    prefsPanne: (code) => `Display preferences not kept (${code})`,
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit:
      'Conflict: this board was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};
