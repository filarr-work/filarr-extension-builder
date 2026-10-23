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
  liste: string;
  titre: string;
  date: string;
  note: string;
  supprimer: (titre: string) => string;
  sansTitre: string;
  dans: (compte: string) => string;
  maintenant: string;
  prochain: string;
  vide: string;
  ajoute: string;
  supprime: string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
  // Le bloc de note
  blocTitre: string;
  regler: string;
  fermer: string;
  pasRegle: string;
  blocIllisible: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    ajouter: 'Nouvel évènement',
    liste: 'Évènements',
    titre: 'Titre',
    date: 'Date et heure',
    note: 'Note',
    supprimer: (t) => `Supprimer « ${t} »`,
    sansTitre: 'Sans titre',
    dans: (c) => `dans ${c}`,
    maintenant: "c'est maintenant",
    prochain: 'Prochain',
    vide: 'Aucun évènement. « Nouvel évènement » pour commencer.',
    ajoute: 'Évènement ajouté',
    supprime: 'Évènement supprimé',
    illisible: "Ce fichier n'est pas une liste d'évènements lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Ce fichier a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des évènements mal formés ont été corrigés ou écartés ; ils seront réécrits au prochain enregistrement.',
    blocTitre: 'Compte à rebours',
    regler: 'Régler',
    fermer: 'Fermer',
    pasRegle: 'Compte à rebours non réglé.',
    blocIllisible: 'Les données de ce bloc sont illisibles. Réglez-le pour les remplacer.',
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ce fichier a été enregistré ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-le.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    ajouter: 'New event',
    liste: 'Events',
    titre: 'Title',
    date: 'Date and time',
    note: 'Note',
    supprimer: (t) => `Delete “${t}”`,
    sansTitre: 'Untitled',
    dans: (c) => `in ${c}`,
    maintenant: "it's now",
    prochain: 'Next',
    vide: 'No events yet. Use “New event” to start.',
    ajoute: 'Event added',
    supprime: 'Event deleted',
    illisible: 'This file is not a readable event list. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This file was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed events were fixed or dropped; they will be rewritten on the next save.',
    blocTitre: 'Countdown',
    regler: 'Set',
    fermer: 'Close',
    pasRegle: 'Countdown not set.',
    blocIllisible: 'This block’s data is unreadable. Set it to replace it.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit:
      'Conflict: this file was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};

/** « il y a 3 jours », « 2 days ago » : l'unité la plus grande qui ait du sens. */
export function depuis(totalMs: number, langue: Langue): string {
  const rtf = new Intl.RelativeTimeFormat(langue, { numeric: 'auto' });
  const s = Math.round(totalMs / 1000);
  if (s < 60) return rtf.format(-s, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), 'hour');
  if (s < 86_400 * 60) return rtf.format(-Math.floor(s / 86_400), 'day');
  return rtf.format(-Math.floor(s / (86_400 * 30)), 'month');
}
