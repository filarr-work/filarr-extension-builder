/**
 * model — l'accès aux données, le même pour les quatre formats.
 *
 * Un format (json, csv, lines, keyvalue) expose un `Scope` : un niveau de
 * champs qu'on lit et qu'on écrit par clé. Le moteur ne voit jamais le texte du
 * fichier ; le format ne voit jamais l'interface. Entre les deux, une règle :
 * on n'écrit QUE la clé touchée. Tout ce que la vue n'affiche pas — clés
 * inconnues, colonnes en plus, lignes de commentaire — reste ce qu'il était.
 *
 * Les valeurs « brutes » sont celles du format : une valeur JSON, ou un texte
 * pour les formats texte. `readValue` / `writeValue` les traduisent vers et
 * depuis la valeur TYPÉE que l'interface manipule, sans jamais jeter : une
 * valeur illisible s'affiche vide et reste intacte tant qu'on n'y touche pas.
 */

import type { FieldDef } from './types';

export interface Scope {
  readonly fields: readonly FieldDef[];
  /** La valeur brute rangée sous `key` (`undefined` si absente). */
  get(key: string): unknown;
  /** Écrit une valeur brute (déjà convertie par `writeValue`). */
  set(key: string, raw: unknown): void;
  /** La liste rangée sous `key` (créée à la première écriture). */
  list(key: string): ListAccess;
  /** Le sous-niveau d'un champ `object` (créé à la première écriture). */
  object(key: string): Scope;
}

export interface ListAccess {
  readonly def: FieldDef;
  length(): number;
  /** L'élément `i`, ou `null` s'il n'a pas une forme utilisable (gardé tel quel). */
  item(i: number): Scope | null;
  /** `textlist` : le texte de l'élément `i`. */
  text(i: number): string;
  setText(i: number, text: string): void;
  /** Ajoute un élément (valeurs par défaut des champs, ou le texte donné) ; rend son indice. */
  add(text?: string): number;
  remove(i: number): void;
  move(from: number, to: number): void;
}

export interface DocFormatContext {
  /** Les valeurs sont-elles rangées en texte (CSV, lignes, clé: valeur) ? */
  textual: boolean;
  /** Le séparateur décimal écrit par défaut (« , » dans un CSV à « ; »). */
  decimal?: ',' | '.';
}

const TRUE_WORDS = ['true', 'vrai', 'oui', 'yes', 'x', '1', '✓', '✔'];

/** Le séparateur des étiquettes, écrit avec une espace après une virgule. */
function joinTags(tags: string[], sep: string): string {
  return tags.join(sep === ',' ? ', ' : sep);
}

export function splitTags(raw: string, sep: string): string[] {
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(n: number, decimal: ',' | '.' = '.'): string {
  const s = String(n);
  return decimal === ',' ? s.replace('.', ',') : s;
}

/** Une valeur vide pour son type — ce qu'affiche un champ absent. */
export function emptyValue(def: FieldDef): unknown {
  switch (def.type) {
    case 'number':
    case 'rating':
      return null;
    case 'boolean':
      return false;
    case 'tags':
    case 'textlist':
    case 'list':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

/** La valeur TYPÉE d'une valeur brute. Ne jette jamais. */
export function readValue(def: FieldDef, raw: unknown, ctx: DocFormatContext): unknown {
  if (ctx.textual) {
    const s = typeof raw === 'string' ? raw : '';
    switch (def.type) {
      case 'number':
      case 'rating':
        return parseNumber(s);
      case 'boolean': {
        const t = s.trim().toLowerCase();
        if (def.trueValue !== undefined && t === def.trueValue.toLowerCase()) return true;
        if (def.falseValue !== undefined && t === def.falseValue.toLowerCase()) return false;
        return TRUE_WORDS.includes(t);
      }
      case 'tags':
        return splitTags(s, def.separator ?? ',');
      default:
        return s;
    }
  }
  switch (def.type) {
    case 'number':
    case 'rating':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      return typeof raw === 'string' ? parseNumber(raw) : null;
    case 'boolean':
      return raw === true;
    case 'tags':
    case 'textlist':
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    case 'list':
      return Array.isArray(raw) ? raw : [];
    case 'object':
      return raw;
    default:
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      return '';
  }
}

/** La valeur brute à ranger pour une valeur typée. */
export function writeValue(def: FieldDef, value: unknown, ctx: DocFormatContext): unknown {
  if (ctx.textual) {
    switch (def.type) {
      case 'number':
      case 'rating':
        return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value, def.decimal ?? ctx.decimal ?? '.') : '';
      case 'boolean':
        return value === true ? (def.trueValue ?? 'true') : (def.falseValue ?? 'false');
      case 'tags':
        return joinTags(Array.isArray(value) ? (value as string[]) : [], def.separator ?? ',');
      default:
        return typeof value === 'string' ? value : '';
    }
  }
  switch (def.type) {
    case 'number':
    case 'rating':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'boolean':
      return value === true;
    case 'tags':
    case 'textlist':
      return Array.isArray(value) ? [...(value as string[])] : [];
    default:
      return typeof value === 'string' ? value : '';
  }
}

/** La valeur par défaut d'un champ, au format brut. */
export function defaultRaw(def: FieldDef, ctx: DocFormatContext): unknown {
  if (def.type === 'list') {
    const items = Array.isArray(def.default) ? (def.default as Record<string, unknown>[]) : [];
    return items.map((it) => defaultObject(def.fields ?? [], ctx, it));
  }
  if (def.type === 'object') {
    return defaultObject(def.fields ?? [], ctx, (def.default as Record<string, unknown>) ?? {});
  }
  return writeValue(def, def.default !== undefined ? structuredCopy(def.default) : emptyValue(def), ctx);
}

/** Un objet neuf : chaque champ à sa valeur par défaut, écrasée par `over`. */
export function defaultObject(
  fields: readonly FieldDef[],
  ctx: DocFormatContext,
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(over, f.key)) {
      const v = over[f.key];
      if (f.type === 'list') {
        out[f.key] = Array.isArray(v) ? v.map((it) => defaultObject(f.fields ?? [], ctx, it as Record<string, unknown>)) : [];
      } else if (f.type === 'object') {
        out[f.key] = defaultObject(f.fields ?? [], ctx, (v as Record<string, unknown>) ?? {});
      } else {
        out[f.key] = writeValue(f, structuredCopy(v), ctx);
      }
    } else {
      out[f.key] = defaultRaw(f, ctx);
    }
  }
  return out;
}

/** Une copie profonde d'une valeur JSON (déjà validée : pas de cycle, pas de prototype). */
export function structuredCopy<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Lit la valeur typée d'un chemin `a.b` (à travers les champs `object`). */
export function resolveScope(scope: Scope, path: string): { scope: Scope; def: FieldDef; key: string } | null {
  const parts = path.split('.');
  let s = scope;
  for (let i = 0; i < parts.length; i++) {
    const def = s.fields.find((f) => f.key === parts[i]);
    if (!def) return null;
    if (i === parts.length - 1) return { scope: s, def, key: parts[i] };
    if (def.type !== 'object') return null;
    s = s.object(parts[i]);
  }
  return null;
}
