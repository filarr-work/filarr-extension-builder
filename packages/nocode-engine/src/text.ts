/**
 * text — les mots du moteur, en français et en anglais, et la lecture des
 * libellés de la configuration.
 *
 * La langue vient de l'hôte (`host.locale`, `ctx.locale`) : `en…` donne
 * l'anglais, tout le reste le français — la langue par défaut de Filarr.
 */

import type { Lang, LocalText } from './types';

export function langOf(locale: unknown): Lang {
  return typeof locale === 'string' && /^en\b/i.test(locale) ? 'en' : 'fr';
}

/** Un libellé de la configuration dans la langue voulue, `fr` en repli. */
export function localText(t: LocalText | undefined, lang: Lang, fallback = ''): string {
  if (t === undefined) return fallback;
  if (typeof t === 'string') return t;
  return t[lang] ?? t.fr ?? t.en ?? fallback;
}

const FR = {
  save: 'Enregistrer',
  saved: 'Enregistré',
  saving: 'Enregistrement…',
  modified: 'Modifié',
  readOnly: 'Lecture seule',
  conflict:
    'Conflit : le document a été enregistré ailleurs entre-temps. Enregistrez pour écraser délibérément, ou rouvrez-le.',
  inFlight: 'Un enregistrement est déjà en cours — nouvel essai dans un instant.',
  saveFailed: 'Échec de l’enregistrement',
  add: 'Ajouter',
  addItem: 'Ajouter un élément',
  addRow: 'Ajouter une ligne',
  addStep: 'Ajouter une étape',
  addTag: 'Ajouter une étiquette',
  newItem: 'Nouvel élément',
  remove: 'Retirer',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  decrease: 'Diminuer',
  increase: 'Augmenter',
  open: 'Ouvrir',
  write: 'Écrire',
  stars: (n: number, max: number) => `${n} sur ${max}`,
  of: 'sur',
  empty: 'Rien pour l’instant.',
  unknownItem: 'Élément non reconnu (gardé tel quel)',
  unreadableTitle: 'Ce fichier ne peut pas être ouvert ici',
  unreadableHint: 'Le fichier n’a pas été modifié.',
  forcedReadOnly: 'Ouvert en lecture seule pour ne rien altérer :',
  duplicateKey: (k: string) => `la clé « ${k} » apparaît deux fois.`,
  imprecise: (n: string) => `le nombre ${n} perdrait des chiffres à l’enregistrement.`,
  errors: {
    too_large: 'Le fichier dépasse 8 Mio.',
    not_utf8: 'Ce fichier n’est pas du texte UTF-8.',
    too_deep: 'Le document est imbriqué sur plus de 12 niveaux.',
    forbidden_key: 'Le document contient une clé interdite',
    invalid_json: 'Ce n’est pas du JSON valide',
    not_object: 'Le document JSON doit être un objet { … }.',
    bad_config: 'Configuration sans code invalide',
  } as Record<string, string>,
};

type Words = typeof FR;

const EN: Words = {
  save: 'Save',
  saved: 'Saved',
  saving: 'Saving…',
  modified: 'Edited',
  readOnly: 'Read-only',
  conflict:
    'Conflict: the document was saved elsewhere in the meantime. Save to overwrite on purpose, or reopen it.',
  inFlight: 'A save is already in progress — retrying shortly.',
  saveFailed: 'Save failed',
  add: 'Add',
  addItem: 'Add an item',
  addRow: 'Add a row',
  addStep: 'Add a step',
  addTag: 'Add a tag',
  newItem: 'New item',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  decrease: 'Decrease',
  increase: 'Increase',
  open: 'Open',
  write: 'Write',
  stars: (n: number, max: number) => `${n} out of ${max}`,
  of: 'of',
  empty: 'Nothing yet.',
  unknownItem: 'Unrecognised item (kept as is)',
  unreadableTitle: 'This file cannot be opened here',
  unreadableHint: 'The file has not been changed.',
  forcedReadOnly: 'Opened read-only so nothing gets altered:',
  duplicateKey: (k: string) => `the key “${k}” appears twice.`,
  imprecise: (n: string) => `the number ${n} would lose digits when saved.`,
  errors: {
    too_large: 'The file is larger than 8 MiB.',
    not_utf8: 'This file is not UTF-8 text.',
    too_deep: 'The document is nested more than 12 levels deep.',
    forbidden_key: 'The document contains a forbidden key',
    invalid_json: 'This is not valid JSON',
    not_object: 'The JSON document must be an object { … }.',
    bad_config: 'Invalid no-code configuration',
  },
};

export function words(lang: Lang): Words {
  return lang === 'en' ? EN : FR;
}

export type { Words };
