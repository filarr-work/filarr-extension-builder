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
  crayon: string;
  selection: string;
  couleurs: Record<string, string>;
  ajouterTexte: string;
  texteDefaut: string;
  annuler: string;
  retablir: string;
  supprimer: string;
  texteSelection: string;
  enSalle: string;
  seul: string;
  surface: string;
  surfaceN: (n: number) => string;
  unTrait: string;
  unTexte: (t: string) => string;
  aide: string;
  autreEnregistre: string;
  ajoute: string;
  supprime: string;
  refusSalle: (code: string) => string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    outils: 'Outils du tableau',
    crayon: 'Crayon',
    selection: 'Sélection',
    couleurs: { '#1f2937': 'encre', '#dc2626': 'rouge', '#2563eb': 'bleu', '#16a34a': 'vert', '#d97706': 'ambre' },
    ajouterTexte: 'Ajouter un texte',
    texteDefaut: 'Texte',
    annuler: 'Annuler mes modifications (Ctrl+Z)',
    retablir: 'Rétablir (Ctrl+Maj+Z)',
    supprimer: 'Supprimer',
    texteSelection: 'Texte de l’élément choisi',
    enSalle: 'Co-édition en direct',
    seul: 'Édition seule',
    surface: 'Tableau blanc',
    surfaceN: (n) => `Tableau blanc, ${n} élément${n > 1 ? 's' : ''}`,
    unTrait: 'Trait à main levée',
    unTexte: (t) => `Texte : ${t || 'vide'}`,
    aide: 'Crayon : tracez au pointeur. Sélection : choisissez un élément, déplacez-le au pointeur ou aux flèches (Maj : plus vite), Suppr l’efface. Tab parcourt les éléments, Entrée sur un texte ouvre son champ.',
    autreEnregistre: 'Enregistré par un autre participant',
    ajoute: 'Texte ajouté',
    supprime: 'Élément supprimé',
    refusSalle: (code) => `Modification refusée par la salle (${code}).`,
    illisible: "Ce fichier n'est pas un tableau blanc lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Ce tableau a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des éléments mal formés ont été corrigés ou écartés ; ils seront réécrits au prochain enregistrement.',
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
    outils: 'Board tools',
    crayon: 'Pen',
    selection: 'Select',
    couleurs: { '#1f2937': 'ink', '#dc2626': 'red', '#2563eb': 'blue', '#16a34a': 'green', '#d97706': 'amber' },
    ajouterTexte: 'Add text',
    texteDefaut: 'Text',
    annuler: 'Undo my changes (Ctrl+Z)',
    retablir: 'Redo (Ctrl+Shift+Z)',
    supprimer: 'Delete',
    texteSelection: 'Text of the selected item',
    enSalle: 'Live co-editing',
    seul: 'Editing alone',
    surface: 'Whiteboard',
    surfaceN: (n) => `Whiteboard, ${n} item${n === 1 ? '' : 's'}`,
    unTrait: 'Freehand stroke',
    unTexte: (t) => `Text: ${t || 'empty'}`,
    aide: 'Pen: draw with the pointer. Select: pick an item, move it with the pointer or the arrow keys (Shift: faster), Delete removes it. Tab walks the items, Enter on a text opens its field.',
    autreEnregistre: 'Saved by another participant',
    ajoute: 'Text added',
    supprime: 'Item deleted',
    refusSalle: (code) => `Change refused by the room (${code}).`,
    illisible: 'This file is not a readable whiteboard. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This board was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed items were fixed or dropped; they will be rewritten on the next save.',
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
