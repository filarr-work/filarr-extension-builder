/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`).
 */

import type { TextesEtat } from './etat';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  ajouter: string;
  decalage: string;
  appliquerDecalage: string;
  trier: string;
  resume: (n: number, duree: string) => string;
  liste: string;
  debut: (n: number) => string;
  fin: (n: number) => string;
  texte: (n: number) => string;
  supprimer: (n: number) => string;
  aide: string;
  tempsIllisible: string;
  finAvantDebut: string;
  chevauche: string;
  desordre: string;
  vide: string;
  importVtt: (reglages: number, blocs: number) => string;
  illisibles: (n: number) => string;
  encodage: string;
  format: string;
  insere: (n: number) => string;
  supprime: (n: number) => string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    ajouter: 'Ajouter un sous-titre',
    decalage: 'Décalage (ms)',
    appliquerDecalage: 'Décaler tout',
    trier: 'Remettre dans l’ordre',
    resume: (n, d) => `${n} sous-titre${n > 1 ? 's' : ''} · ${d}`,
    liste: 'Sous-titres',
    debut: (n) => `Début du sous-titre ${n}`,
    fin: (n) => `Fin du sous-titre ${n}`,
    texte: (n) => `Texte du sous-titre ${n}`,
    supprimer: (n) => `Supprimer le sous-titre ${n}`,
    aide: 'Alt+↑ / Alt+↓ : même champ, sous-titre précédent ou suivant. Ctrl+Entrée : insérer un sous-titre après celui-ci.',
    tempsIllisible: 'Temps illisible : attendu HH:MM:SS,mmm',
    finAvantDebut: 'La fin précède le début.',
    chevauche: 'Chevauche le sous-titre suivant.',
    desordre: 'Les sous-titres ne sont pas dans l’ordre des temps.',
    vide: 'Aucun sous-titre. « Ajouter un sous-titre » pour commencer.',
    importVtt: (r, b) =>
      'Importé depuis WebVTT : le premier enregistrement créera un fichier .srt à côté de l’original, qui reste intact.' +
      (r + b > 0 ? ` Ignoré : ${r} réglage${r > 1 ? 's' : ''} de position, ${b} bloc${b > 1 ? 's' : ''} de style ou de note.` : ''),
    illisibles: (n) => `${n} bloc${n > 1 ? 's' : ''} illisible${n > 1 ? 's' : ''} ignoré${n > 1 ? 's' : ''} : ils disparaîtront au prochain enregistrement.`,
    encodage: "Ce fichier n'est pas du texte UTF-8. Il est laissé intact : rien ne sera enregistré.",
    format: "Ce fichier ne contient aucun sous-titre reconnaissable. Il est laissé intact : rien ne sera enregistré.",
    insere: (n) => `Sous-titre ${n} inséré`,
    supprime: (n) => `Sous-titre ${n} supprimé`,
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ces sous-titres ont été enregistrés ailleurs depuis leur ouverture. Appuyez sur Ctrl+S pour les écraser délibérément, ou rouvrez-les.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    ajouter: 'Add a subtitle',
    decalage: 'Offset (ms)',
    appliquerDecalage: 'Shift all',
    trier: 'Put back in order',
    resume: (n, d) => `${n} subtitle${n === 1 ? '' : 's'} · ${d}`,
    liste: 'Subtitles',
    debut: (n) => `Start of subtitle ${n}`,
    fin: (n) => `End of subtitle ${n}`,
    texte: (n) => `Text of subtitle ${n}`,
    supprimer: (n) => `Delete subtitle ${n}`,
    aide: 'Alt+↑ / Alt+↓: same field, previous or next subtitle. Ctrl+Enter: insert a subtitle after this one.',
    tempsIllisible: 'Unreadable time: expected HH:MM:SS,mmm',
    finAvantDebut: 'The end comes before the start.',
    chevauche: 'Overlaps the next subtitle.',
    desordre: 'The subtitles are not in time order.',
    vide: 'No subtitles yet. Use “Add a subtitle” to start.',
    importVtt: (r, b) =>
      'Imported from WebVTT: the first save will create a .srt file next to the original, which stays untouched.' +
      (r + b > 0 ? ` Dropped: ${r} positioning setting${r === 1 ? '' : 's'}, ${b} style or note block${b === 1 ? '' : 's'}.` : ''),
    illisibles: (n) => `${n} unreadable block${n === 1 ? '' : 's'} skipped: ${n === 1 ? 'it' : 'they'} will be gone after the next save.`,
    encodage: 'This file is not UTF-8 text. It is left untouched: nothing will be saved.',
    format: 'This file has no recognisable subtitles. It is left untouched: nothing will be saved.',
    insere: (n) => `Subtitle ${n} inserted`,
    supprime: (n) => `Subtitle ${n} deleted`,
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit:
      'Conflict: these subtitles were saved elsewhere since you opened them. Press Ctrl+S to overwrite them on purpose, or reopen them.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};
