import type { NocodeConfig } from '../src/types';

export const recetteConfig: NocodeConfig = {
  nocode: 1,
  id: 'carnet-recettes',
  format: { type: 'json' },
  accent: '#c2410c',
  fields: [
    { key: 'titre', type: 'text', label: { fr: 'Titre', en: 'Title' }, default: '' },
    {
      key: 'categorie',
      type: 'choice',
      label: 'Catégorie',
      options: [
        { value: 'plat', label: { fr: 'Plat', en: 'Main' }, color: '#c2410c' },
        { value: 'dessert', label: { fr: 'Dessert', en: 'Dessert' } },
      ],
      default: 'plat',
    },
    { key: 'portions', type: 'number', label: 'Portions', min: 1, max: 50, default: 4 },
    { key: 'temps', type: 'number', label: 'Temps', unit: 'min' },
    {
      key: 'ingredients',
      type: 'list',
      label: 'Ingrédients',
      fields: [
        { key: 'pris', type: 'boolean' },
        { key: 'nom', type: 'text' },
      ],
    },
    { key: 'etapes', type: 'textlist', label: 'Étapes' },
    { key: 'notes', type: 'longtext', label: 'Notes' },
  ],
  view: [
    { type: 'title', field: 'titre' },
    { type: 'badges', items: [{ field: 'categorie' }, { field: 'portions', stepper: true }, { field: 'temps' }] },
    { type: 'checklist', field: 'ingredients', check: 'pris', text: 'nom' },
    { type: 'steps', field: 'etapes' },
    { type: 'longtext', field: 'notes' },
  ],
  functions: {
    extractText: true,
    fields: [
      { key: 'portions', field: 'portions' },
      { key: 'temps', field: 'temps' },
      { key: 'categorie', field: 'categorie' },
    ],
    exports: [{ to: 'md' }, { to: 'json' }, { to: 'html' }, { to: 'txt' }],
  },
};

export const inventaireConfig: NocodeConfig = {
  nocode: 1,
  id: 'inventaire',
  format: { type: 'csv', delimiter: ',' },
  fields: [
    { key: 'article', type: 'text', label: 'Article' },
    { key: 'quantite', type: 'number', label: 'Quantité', min: 0, default: 1 },
    { key: 'prix', type: 'number', label: 'Prix', decimals: 2 },
    { key: 'ok', type: 'boolean', trueValue: 'x', falseValue: '' },
  ],
  view: [
    { type: 'table', columns: ['article', 'quantite', 'prix', 'ok'] },
    { type: 'total', label: 'Valeur', compute: { op: 'sumProduct', of: ['quantite', 'prix'] }, decimals: 2 },
    { type: 'total', label: 'Articles', compute: { op: 'sum', of: 'quantite' } },
  ],
  functions: { exports: [{ to: 'csv' }, { to: 'json' }], fields: [{ key: 'total', compute: { op: 'sum', of: 'quantite' } }] },
};

export const coursesConfig: NocodeConfig = {
  nocode: 1,
  id: 'liste-courses',
  format: { type: 'lines' },
  fields: [{ key: 'text', type: 'text', label: 'Article', placeholder: 'Ajouter un article' }],
  view: [{ type: 'progress' }, { type: 'checklist' }],
};

export const contactConfig: NocodeConfig = {
  nocode: 1,
  id: 'fiche-contact',
  format: { type: 'keyvalue', separator: ':' },
  fields: [
    { key: 'nom', type: 'text', label: 'Nom' },
    { key: 'email', type: 'email', label: 'E-mail' },
    { key: 'site', type: 'url', label: 'Site' },
    { key: 'tags', type: 'tags', label: 'Étiquettes' },
    { key: 'favori', type: 'boolean', label: 'Favori', trueValue: 'oui', falseValue: 'non' },
  ],
  view: [
    { type: 'title', field: 'nom' },
    { type: 'link', field: 'email' },
    { type: 'link', field: 'site' },
    { type: 'fields', fields: ['tags', 'favori'] },
  ],
  functions: { extractText: true },
};

export const glossaireConfig: NocodeConfig = {
  nocode: 1,
  id: 'glossaire',
  format: { type: 'keyvalue', separator: ':', mode: 'entries' },
  fields: [
    { key: 'key', type: 'text', label: 'Terme' },
    { key: 'value', type: 'text', label: 'Définition' },
  ],
  view: [{ type: 'table', columns: ['key', 'value'] }],
};

export const enc = (s: string) => new TextEncoder().encode(s);
export const dec = (b: Uint8Array) => new TextDecoder().decode(b);
