/**
 * fields — le tableau des champs de l'écran « Données » : aplatir l'arbre des
 * champs en lignes (`ingredients[].nom`), et le modifier sans jamais produire
 * une propriété que le moteur refuserait (liste fermée, `schema.ts`).
 */

import type { ChoiceOption, FieldDef, FieldType, FormatDef, LocalText } from '@filarr/nocode-engine';

/** Les propriétés permises par type (recopiées de `FIELD_PROPS`, schema.ts). */
export const FIELD_PROPS: Record<FieldType, readonly string[]> = {
  text: ['placeholder'],
  longtext: ['placeholder'],
  number: ['placeholder', 'min', 'max', 'step', 'unit', 'decimals', 'decimal'],
  boolean: ['trueValue', 'falseValue'],
  date: [],
  url: ['placeholder'],
  email: ['placeholder'],
  choice: ['options'],
  tags: ['placeholder', 'separator'],
  rating: ['max'],
  textlist: ['placeholder'],
  list: ['fields'],
  object: ['fields'],
};

export const ALL_TYPES: FieldType[] = ['text', 'longtext', 'number', 'boolean', 'date', 'url', 'email', 'choice', 'tags', 'rating', 'textlist', 'list', 'object'];
export const SCALAR_TYPES: FieldType[] = ['text', 'longtext', 'number', 'boolean', 'date', 'url', 'email', 'choice', 'tags', 'rating'];

/** Les types permis à un niveau donné (CSV, lignes, clé: valeur n'ont qu'une valeur par cellule). */
export function typesFor(format: FormatDef, depth: number): FieldType[] {
  if (format.type === 'json' || depth > 0) return depth >= 2 ? ALL_TYPES.filter((t) => t !== 'list' && t !== 'object') : ALL_TYPES;
  if (format.type === 'keyvalue') return SCALAR_TYPES.filter((t) => t !== 'longtext');
  return SCALAR_TYPES;
}

export interface FieldRow {
  /** Le chemin affiché : `titre`, `ingredients[].nom`, `adresse.ville`. */
  path: string;
  /** Les indices dans l'arbre (`fields[i].fields[j]`). */
  index: number[];
  def: FieldDef;
  depth: number;
}

export function flattenFields(fields: FieldDef[], prefix = '', index: number[] = [], depth = 0): FieldRow[] {
  const out: FieldRow[] = [];
  fields.forEach((f, i) => {
    const path = prefix ? `${prefix}${f.key}` : f.key;
    out.push({ path, index: [...index, i], def: f, depth });
    if ((f.type === 'list' || f.type === 'object') && f.fields) {
      out.push(...flattenFields(f.fields, `${path}${f.type === 'list' ? '[].' : '.'}`, [...index, i], depth + 1));
    }
  });
  return out;
}

/** Remplace le champ désigné par `index` dans une copie de l'arbre. */
export function updateField(fields: FieldDef[], index: number[], fn: (f: FieldDef) => FieldDef | null): FieldDef[] {
  const [head, ...rest] = index;
  const out: FieldDef[] = [];
  fields.forEach((f, i) => {
    if (i !== head) out.push(f);
    else if (rest.length === 0) {
      const n = fn(f);
      if (n) out.push(n);
    } else out.push({ ...f, fields: updateField(f.fields ?? [], rest, fn) });
  });
  return out;
}

export function addField(fields: FieldDef[], parent: number[], field: FieldDef): FieldDef[] {
  if (parent.length === 0) return [...fields, field];
  return updateField(fields, parent, (f) => ({ ...f, fields: [...(f.fields ?? []), field] }));
}

/** Une clé neuve qui n'existe pas encore à ce niveau. */
export function freshKey(fields: FieldDef[], base = 'champ'): string {
  let n = 1;
  let k = base;
  while (fields.some((f) => f.key === k)) k = `${base}_${++n}`;
  return k;
}

/**
 * Change le type d'un champ en ne gardant que ce que le nouveau type admet. La
 * valeur par défaut est retirée (elle était au type de l'ancien). Les options
 * d'un « choix » sont préremplies avec les valeurs vues dans l'exemple.
 */
export function changeType(f: FieldDef, type: FieldType, seen: string[] = []): FieldDef {
  const keep = new Set(['key', 'type', 'label', ...FIELD_PROPS[type]]);
  const next: Record<string, unknown> = { type };
  for (const [k, v] of Object.entries(f)) if (keep.has(k) && k !== 'type' && k !== 'default') next[k] = v;
  if (type === 'choice' && !next.options) {
    const values = seen.filter((v) => v !== '' && v.length <= 200 && !/[\r\n]/.test(v)).slice(0, 50);
    next.options = (values.length ? values : ['a', 'b']).map((value): ChoiceOption => ({ value }));
  }
  if ((type === 'list' || type === 'object') && !next.fields) next.fields = [{ key: 'texte', type: 'text', label: 'Texte' }];
  return { key: f.key, ...next } as unknown as FieldDef;
}

/** La valeur par défaut affichable, et sa relecture depuis le champ texte. */
export function defaultToText(f: FieldDef): string {
  const d = f.default;
  if (d === undefined) return '';
  if (Array.isArray(d)) return f.type === 'tags' || f.type === 'textlist' ? (d as string[]).join(', ') : JSON.stringify(d);
  return String(d);
}

export function textToDefault(f: FieldDef, s: string): unknown {
  const t = s.trim();
  if (t === '') return undefined;
  switch (f.type) {
    case 'number':
    case 'rating': {
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return ['true', 'oui', 'yes', 'vrai', '1', 'x'].includes(t.toLowerCase());
    case 'tags':
    case 'textlist':
      return t.split(',').map((x) => x.trim()).filter(Boolean);
    case 'list':
    case 'object':
      return undefined;
    default:
      return s;
  }
}

export function labelText(l: LocalText | undefined, lang: 'fr' | 'en'): string {
  if (l === undefined) return '';
  return typeof l === 'string' ? l : (l[lang] ?? l.fr ?? l.en ?? '');
}

/** Pose le libellé dans la langue de l'interface, en gardant l'autre langue si elle existe. */
export function setLabel(l: LocalText | undefined, lang: 'fr' | 'en', value: string): LocalText | undefined {
  if (value === '') {
    if (typeof l === 'object' && l) {
      const other = lang === 'fr' ? l.en : l.fr;
      return other ? { [lang === 'fr' ? 'en' : 'fr']: other } : undefined;
    }
    return undefined;
  }
  if (typeof l === 'object' && l) return { ...l, [lang]: value };
  if (lang === 'fr') return value;
  return typeof l === 'string' ? { fr: l, en: value } : { en: value };
}
