/**
 * types — la configuration DÉCLARATIVE d'une extension sans code (format 1).
 *
 * Une seule chose à retenir : la configuration est une DONNÉE. Elle voyage en
 * JSON dans le bundle (PACKAGE.md §4), Filarr la relit par `JSON.parse` sans
 * l'évaluer et la montre à la relecture. Elle ne porte donc ni code, ni HTML,
 * ni sélecteur CSS : des clés, des types, des libellés. Le moteur la valide au
 * montage comme à la construction (`schema.ts`), par liste fermée.
 *
 * La documentation complète, avec des exemples : `docs/nocode.md`.
 */

import type { ExportTarget } from '@filarr/extension-api';

export type Lang = 'fr' | 'en';

/** Un libellé : une chaîne, ou une chaîne par langue (`fr` sert de repli). */
export type LocalText = string | { fr?: string; en?: string };

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'url'
  | 'email'
  | 'choice'
  | 'tags'
  | 'rating'
  | 'textlist'
  | 'list'
  | 'object';

export interface ChoiceOption {
  value: string;
  label?: LocalText;
  /** `#rrggbb` — la teinte de la pastille. */
  color?: string;
}

export interface FieldDef {
  key: string;
  type: FieldType;
  label?: LocalText;
  placeholder?: LocalText;
  /** La valeur d'un document neuf (ou d'un élément ajouté), au type du champ. */
  default?: unknown;
  /** `number` : bornes, pas, unité, décimales ; `rating` : `max` = nombre d'étoiles. */
  min?: number;
  max?: number;
  step?: number;
  unit?: LocalText;
  decimals?: number;
  /** `choice` : la liste des valeurs proposées. */
  options?: ChoiceOption[];
  /** `boolean` en CSV et clé: valeur : le texte écrit pour vrai et pour faux. */
  trueValue?: string;
  falseValue?: string;
  /** `tags` en CSV et clé: valeur : le séparateur des étiquettes (`,` par défaut). */
  separator?: string;
  /** `number` en CSV et clé: valeur : le séparateur décimal écrit. */
  decimal?: ',' | '.';
  /** `list` : les champs d'un élément ; `object` : les sous-champs. */
  fields?: FieldDef[];
}

export type FormatDef =
  | { type: 'json'; indent?: 0 | 2 | 4 | 'tab' }
  | { type: 'csv'; delimiter?: ',' | ';' | '\t' }
  | { type: 'lines' }
  | { type: 'keyvalue'; separator?: ':' | '='; mode?: 'fields' | 'entries' };

export type ComputeOp = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countChecked' | 'sumProduct';

export interface ComputeDef {
  op: ComputeOp;
  /** La liste parcourue. Absente : la liste implicite du format, ou les champs du niveau. */
  field?: string;
  /** Le ou les champs lus (dans chaque élément de la liste, ou au niveau courant). */
  of?: string | string[];
}

export interface BadgeItem {
  field: string;
  label?: LocalText;
  /** `number` : boutons − et +. */
  stepper?: boolean;
}

export type BlockDef =
  | { type: 'title'; field: string; placeholder?: LocalText }
  | { type: 'badges'; items: BadgeItem[] }
  | { type: 'checklist'; field?: string; check?: string; text?: string; label?: LocalText; addLabel?: LocalText }
  | { type: 'steps'; field: string; text?: string; label?: LocalText; addLabel?: LocalText }
  | { type: 'longtext'; field: string; label?: LocalText; rows?: number }
  | { type: 'number'; field: string; label?: LocalText }
  | { type: 'table'; field?: string; columns?: string[]; label?: LocalText; addLabel?: LocalText }
  | { type: 'tags'; field: string; label?: LocalText }
  | { type: 'date'; field: string; label?: LocalText }
  | { type: 'link'; field: string; label?: LocalText }
  | { type: 'section'; title: LocalText; blocks: BlockDef[]; collapsed?: boolean }
  | { type: 'rating'; field: string; label?: LocalText }
  | { type: 'progress'; field?: string; check?: string; max?: number; maxField?: string; label?: LocalText }
  | { type: 'total'; label: LocalText; compute: ComputeDef; unit?: LocalText; decimals?: number }
  | { type: 'fields'; fields: string[]; label?: LocalText }
  | { type: 'cards'; field: string; blocks: BlockDef[]; label?: LocalText; addLabel?: LocalText };

export type BlockType = BlockDef['type'];

export interface FunctionFieldDef {
  /** La clé déclarée au manifeste (`^[a-z][a-z0-9_]{0,31}$`). */
  key: string;
  /** Un champ lu tel quel… */
  field?: string;
  /** …ou une valeur calculée. */
  compute?: ComputeDef;
}

export interface FunctionsDef {
  /** `true` : tout le texte des champs ; `{ fields }` : seulement ceux-là. */
  extractText?: true | { fields: string[] };
  fields?: FunctionFieldDef[];
  exports?: { to: ExportTarget; field?: string }[];
}

export interface NocodeConfig {
  /** Le format de la configuration elle-même. */
  nocode: 1;
  /** L'identifiant du manifeste : l'éditeur est monté sous `<id>-editor`. */
  id: string;
  format: FormatDef;
  fields: FieldDef[];
  view: BlockDef[];
  /** `#rrggbb` — boutons, cases, étoiles, barres. */
  accent?: string;
  functions?: FunctionsDef;
}

export interface ConfigIssue {
  /** Où, dans la configuration : `view[2].field`, `fields[0].options[1]`… */
  path: string;
  message: string;
}
