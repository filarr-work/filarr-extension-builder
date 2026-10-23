/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`).
 */

import type { TextesEtat } from './etat';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  titre: string;
  titrePlaceholder: string;
  colonnes: string;
  ajouter: string;
  photos: string;
  legende: (nom: string) => string;
  avant: (nom: string) => string;
  apres: (nom: string) => string;
  retirer: (nom: string) => string;
  relire: string;
  relue: string;
  vide: string;
  lecture: (n: number) => string;
  ajoutees: (n: number) => string;
  refus: Record<string, (nom: string) => string>;
  echecSelecteur: (code: string) => string;
  sansSelecteur: string;
  session: string;
  plein: string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    titre: 'Titre de la planche',
    titrePlaceholder: 'Planche sans titre',
    colonnes: 'Colonnes',
    ajouter: 'Ajouter des photos…',
    photos: 'Photos de la planche',
    legende: (n) => `Légende de ${n}`,
    avant: (n) => `Avancer ${n}`,
    apres: (n) => `Reculer ${n}`,
    retirer: (n) => `Retirer ${n}`,
    relire: 'Relire l’original',
    relue: 'Vignette refaite depuis l’original.',
    vide: 'Planche vide. « Ajouter des photos… » ouvre le sélecteur de Filarr.',
    lecture: (n) => `Lecture de ${n} image${n > 1 ? 's' : ''}…`,
    ajoutees: (n) => `${n} photo${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`,
    refus: {
      pas_une_image: (n) => `« ${n} » n'est pas une image PNG, JPEG ou WebP : écartée.`,
      image_illisible: (n) => `« ${n} » : image illisible, écartée.`,
      image_trop_grande: (n) => `« ${n} » : trop grande pour être réduite ici, écartée.`,
      unknown_handle: (n) => `« ${n} » : la poignée a expiré. Choisissez l'image à nouveau.`,
      busy: () => 'Le sélecteur de Filarr est déjà ouvert.',
    },
    echecSelecteur: (c) => `Le sélecteur n'a pas pu s'ouvrir (${c}).`,
    sansSelecteur: "Le sélecteur de fichiers n'a pas été accordé à cette extension.",
    session:
      "Filarr ne donne à l'extension que les images que vous choisissez, par des poignées valables pour cette session. La planche garde une copie réduite : elle se rouvre sans les originaux, et ne dit jamais où ils sont.",
    plein: 'La planche est pleine (60 photos).',
    illisible: "Ce fichier n'est pas une planche lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Cette planche a été écrite par une version plus récente de l'extension (format ${v}). Elle est laissée intacte.`,
    repare: 'Des photos mal formées ont été écartées ; elles disparaîtront au prochain enregistrement.',
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : cette planche a été enregistrée ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-la.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    titre: 'Sheet title',
    titrePlaceholder: 'Untitled sheet',
    colonnes: 'Columns',
    ajouter: 'Add photos…',
    photos: 'Photos on the sheet',
    legende: (n) => `Caption of ${n}`,
    avant: (n) => `Move ${n} earlier`,
    apres: (n) => `Move ${n} later`,
    retirer: (n) => `Remove ${n}`,
    relire: 'Re-read original',
    relue: 'Thumbnail rebuilt from the original.',
    vide: 'Empty sheet. “Add photos…” opens the Filarr picker.',
    lecture: (n) => `Reading ${n} image${n === 1 ? '' : 's'}…`,
    ajoutees: (n) => `${n} photo${n === 1 ? '' : 's'} added`,
    refus: {
      pas_une_image: (n) => `“${n}” is not a PNG, JPEG or WebP image: skipped.`,
      image_illisible: (n) => `“${n}”: unreadable image, skipped.`,
      image_trop_grande: (n) => `“${n}”: too large to be reduced here, skipped.`,
      unknown_handle: (n) => `“${n}”: the handle has expired. Pick the image again.`,
      busy: () => 'The Filarr picker is already open.',
    },
    echecSelecteur: (c) => `The picker could not open (${c}).`,
    sansSelecteur: 'The file picker was not granted to this extension.',
    session:
      'Filarr only gives the extension the images you pick, through handles valid for this session. The sheet keeps a reduced copy: it reopens without the originals, and never tells where they are.',
    plein: 'The sheet is full (60 photos).',
    illisible: 'This file is not a readable sheet. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This sheet was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed photos were dropped; they will be gone after the next save.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit: 'Conflict: this sheet was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};
