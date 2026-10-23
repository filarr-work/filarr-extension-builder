/**
 * schema — la validation STRICTE d'une configuration sans code.
 *
 * Appelée deux fois, et c'est voulu : à la construction (`buildNocodeBundle`,
 * `filarr-ext check`), pour que l'auteur voie ses fautes ; au montage (dans la
 * page bac à sable), parce que le bundle peut avoir été retouché depuis — le
 * moteur ne fait confiance qu'à ce qu'il a lui-même relu.
 *
 * LISTE FERMÉE partout : une propriété inconnue est une erreur, pas un réglage
 * ignoré. Une faute de frappe (`placholder`) qui passerait en silence serait un
 * réglage que l'auteur croit actif et qui ne l'est pas.
 *
 * Toutes les références (`field`, `columns`, `of`…) sont résolues ici contre
 * les champs déclarés, au niveau où le bloc est posé : un bloc qui vise un
 * champ absent, ou d'un type qu'il ne sait pas montrer, est refusé avant
 * d'arriver chez l'utilisateur.
 */

import { checkValueTree, hasOwn, isForbiddenKey, isPlainObject, MAX_DEPTH } from './safe';
import type {
  BlockDef,
  ComputeDef,
  ConfigIssue,
  FieldDef,
  FieldType,
  FormatDef,
  LocalText,
  NocodeConfig,
} from './types';

export const CONFIG_FORMAT = 1;
export const MAX_CONFIG_BYTES = 256 * 1024;
const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
/** La forme d'une clé déclarée au manifeste (`extensionCapabilities.ts`, KEY_RE). */
const FUNCTION_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 200;
const MAX_DEFAULT_TEXT = 10_000;
const MAX_DEFAULT_ITEMS = 1000;
const MAX_FIELDS_PER_LEVEL = 64;
const MAX_FIELDS_TOTAL = 256;
const MAX_BLOCKS_TOTAL = 300;

const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'longtext',
  'number',
  'boolean',
  'date',
  'url',
  'email',
  'choice',
  'tags',
  'rating',
  'textlist',
  'list',
  'object',
];

/** Les types qui tiennent dans une cellule, une pastille, un champ de formulaire. */
export const SCALAR_TYPES: readonly FieldType[] = [
  'text',
  'longtext',
  'number',
  'boolean',
  'date',
  'url',
  'email',
  'choice',
  'tags',
  'rating',
];

/** Les propriétés permises, type par type — le reste est une faute. */
const FIELD_PROPS: Record<FieldType, readonly string[]> = {
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
const COMMON_FIELD_PROPS = ['key', 'type', 'label', 'default'];

const BLOCK_PROPS: Record<BlockDef['type'], readonly string[]> = {
  title: ['field', 'placeholder'],
  badges: ['items'],
  checklist: ['field', 'check', 'text', 'label', 'addLabel'],
  steps: ['field', 'text', 'label', 'addLabel'],
  longtext: ['field', 'label', 'rows'],
  number: ['field', 'label'],
  table: ['field', 'columns', 'label', 'addLabel'],
  tags: ['field', 'label'],
  date: ['field', 'label'],
  link: ['field', 'label'],
  section: ['title', 'blocks', 'collapsed'],
  rating: ['field', 'label'],
  progress: ['field', 'check', 'max', 'maxField', 'label'],
  total: ['label', 'compute', 'unit', 'decimals'],
  fields: ['fields', 'label'],
  cards: ['field', 'blocks', 'label', 'addLabel'],
};

/** La liste implicite d'un format : un CSV est une liste de lignes, etc. */
export function implicitListKey(format: FormatDef): 'rows' | 'items' | 'entries' | null {
  if (format.type === 'csv') return 'rows';
  if (format.type === 'lines') return 'items';
  if (format.type === 'keyvalue' && format.mode === 'entries') return 'entries';
  return null;
}

/** Le format range-t-il ses valeurs en texte (CSV, lignes, clé: valeur) ? */
export function isTextualFormat(format: FormatDef): boolean {
  return format.type !== 'json';
}

const LINES_ITEM: FieldDef[] = [
  { key: 'done', type: 'boolean', label: { fr: 'Fait', en: 'Done' } },
  { key: 'text', type: 'text', label: { fr: 'Texte', en: 'Text' } },
];
const ENTRIES_ITEM: FieldDef[] = [
  { key: 'key', type: 'text', label: { fr: 'Clé', en: 'Key' } },
  { key: 'value', type: 'text', label: { fr: 'Valeur', en: 'Value' } },
];

/** Les champs implicites, complétés par ce que la configuration en précise. */
function mergeImplicit(base: FieldDef[], declared: FieldDef[]): FieldDef[] {
  return base.map((b) => {
    const d = declared.find((f) => f.key === b.key);
    return d ? { ...b, ...d } : b;
  });
}

/**
 * Les champs du niveau racine, tels que les blocs les voient. Pour un format à
 * liste implicite, la racine porte UNE liste (`rows`, `items`, `entries`) dont
 * les éléments ont les champs déclarés.
 */
export function rootFields(config: Pick<NocodeConfig, 'format' | 'fields'>): FieldDef[] {
  const f = config.format;
  if (f.type === 'csv') return [{ key: 'rows', type: 'list', fields: config.fields }];
  if (f.type === 'lines') return [{ key: 'items', type: 'list', fields: mergeImplicit(LINES_ITEM, config.fields) }];
  if (f.type === 'keyvalue' && f.mode === 'entries') {
    return [{ key: 'entries', type: 'list', fields: mergeImplicit(ENTRIES_ITEM, config.fields) }];
  }
  return config.fields;
}

/** Un champ visé par un chemin `a.b`, à travers les champs `object`. */
export function resolveField(fields: readonly FieldDef[], path: string): FieldDef | null {
  let niveau: readonly FieldDef[] | undefined = fields;
  let trouve: FieldDef | null = null;
  for (const part of path.split('.')) {
    if (!niveau) return null;
    trouve = niveau.find((f) => f.key === part) ?? null;
    if (!trouve) return null;
    niveau = trouve.type === 'object' ? trouve.fields : undefined;
  }
  return trouve;
}

/** Le type de colonne que Filarr attend pour une valeur rendue par `fields`. */
export function manifestFieldType(def: FieldDef | null): 'text' | 'number' | 'date' | 'checkbox' | 'url' {
  if (!def) return 'number';
  if (def.type === 'number' || def.type === 'rating') return 'number';
  if (def.type === 'boolean') return 'checkbox';
  if (def.type === 'date') return 'date';
  if (def.type === 'url') return 'url';
  return 'text';
}

// ── La validation ───────────────────────────────────────────────────────────

class Collector {
  issues: ConfigIssue[] = [];
  fieldCount = 0;
  blockCount = 0;
  add(path: string, message: string): void {
    if (this.issues.length < 100) this.issues.push({ path, message });
  }
}

const isRecord = isPlainObject;

function onlyProps(c: Collector, o: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) c.add(path ? `${path}.${k}` : k, `propriété inconnue « ${k} »`);
  }
}

/** Les caractères qui rendent un libellé ou une clé illisible ou trompeur. */
const INVISIBLE_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function checkText(c: Collector, v: unknown, path: string, required: boolean, max = MAX_TEXT): void {
  if (v === undefined) {
    if (required) c.add(path, 'libellé obligatoire');
    return;
  }
  const one = (s: unknown, p: string) => {
    if (typeof s !== 'string' || s.length === 0 || s.length > max || INVISIBLE_RE.test(s)) {
      c.add(p, `texte de 1 à ${max} caractères, sans caractère invisible`);
    }
  };
  if (typeof v === 'string') return one(v, path);
  if (isRecord(v)) {
    onlyProps(c, v, ['fr', 'en'], path);
    if (v.fr === undefined && v.en === undefined) c.add(path, 'au moins { fr } ou { en }');
    if (v.fr !== undefined) one(v.fr, `${path}.fr`);
    if (v.en !== undefined) one(v.en, `${path}.en`);
    return;
  }
  c.add(path, 'un texte, ou { fr, en }');
}

/** Une clé de champ : 1 à 64 caractères, sans point (il sépare les chemins), ni clé interdite. */
export function isFieldKey(k: unknown): k is string {
  return (
    typeof k === 'string' &&
    k.length >= 1 &&
    k.length <= 64 &&
    k.trim() === k &&
    !k.includes('.') &&
    !INVISIBLE_RE.test(k) &&
    !isForbiddenKey(k)
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkDefault(c: Collector, def: FieldDef, v: unknown, path: string, depth = 0): void {
  if (depth > MAX_DEPTH) return c.add(path, 'valeur par défaut trop imbriquée');
  const str = (s: unknown) => typeof s === 'string' && s.length <= MAX_DEFAULT_TEXT;
  switch (def.type) {
    case 'text':
    case 'longtext':
    case 'url':
    case 'email':
      if (!str(v)) c.add(path, 'valeur par défaut : un texte');
      return;
    case 'date':
      if (!(v === '' || (typeof v === 'string' && DATE_RE.test(v)))) c.add(path, 'valeur par défaut : "AAAA-MM-JJ" ou ""');
      return;
    case 'choice':
      if (!(v === '' || (typeof v === 'string' && (def.options ?? []).some((o) => o.value === v)))) {
        c.add(path, 'valeur par défaut : une des valeurs de `options`, ou ""');
      }
      return;
    case 'number':
      if (!isFiniteNumber(v)) c.add(path, 'valeur par défaut : un nombre');
      return;
    case 'rating':
      if (!(isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v <= (def.max ?? 5))) {
        c.add(path, 'valeur par défaut : un entier de 0 au nombre d’étoiles');
      }
      return;
    case 'boolean':
      if (typeof v !== 'boolean') c.add(path, 'valeur par défaut : true ou false');
      return;
    case 'tags':
    case 'textlist':
      if (!Array.isArray(v) || v.length > MAX_DEFAULT_ITEMS || !v.every(str)) c.add(path, 'valeur par défaut : une liste de textes');
      return;
    case 'list':
      if (!Array.isArray(v) || v.length > MAX_DEFAULT_ITEMS) return c.add(path, 'valeur par défaut : une liste d’objets');
      v.forEach((item, i) => checkObjectDefault(c, def.fields ?? [], item, `${path}[${i}]`, depth + 1));
      return;
    case 'object':
      checkObjectDefault(c, def.fields ?? [], v, path, depth + 1);
      return;
  }
}

function checkObjectDefault(c: Collector, fields: FieldDef[], v: unknown, path: string, depth: number): void {
  if (!isRecord(v)) return c.add(path, 'un objet');
  for (const [k, val] of Object.entries(v)) {
    const f = fields.find((x) => x.key === k);
    if (!f) c.add(`${path}.${k}`, `« ${k} » n’est pas un champ de l’élément`);
    else checkDefault(c, f, val, `${path}.${k}`, depth);
  }
}

interface FieldContext {
  format: FormatDef;
  /** Le niveau racine d'un format texte : seuls les types scalaires y vivent. */
  textual: boolean;
  /** Le niveau d'une liste implicite figée (lignes, entrées). */
  fixedKeys?: Record<string, readonly FieldType[]>;
}

function checkFields(c: Collector, raw: unknown, path: string, ctx: FieldContext, depth: number): FieldDef[] {
  if (!Array.isArray(raw)) {
    c.add(path, 'une liste de champs');
    return [];
  }
  const max = ctx.fixedKeys ? Object.keys(ctx.fixedKeys).length : MAX_FIELDS_PER_LEVEL;
  if (raw.length > max) c.add(path, `${max} champs au plus`);
  if (!ctx.fixedKeys && raw.length === 0 && depth > 0) c.add(path, 'au moins un champ');
  const cles = new Set<string>();
  const out: FieldDef[] = [];
  raw.forEach((f, i) => {
    const p = `${path}[${i}]`;
    c.fieldCount++;
    if (!isRecord(f)) return c.add(p, 'un objet { key, type, … }');
    if (!isFieldKey(f.key)) {
      c.add(`${p}.key`, 'clé de 1 à 64 caractères, sans point ni caractère invisible ; « __proto__ », « constructor » et « prototype » sont interdites');
      return;
    }
    if (cles.has(f.key)) c.add(`${p}.key`, `clé « ${f.key} » en double`);
    cles.add(f.key);
    if (typeof f.type !== 'string' || !(FIELD_TYPES as readonly string[]).includes(f.type)) {
      c.add(`${p}.type`, `type inconnu — parmi ${FIELD_TYPES.join(', ')}`);
      return;
    }
    const type = f.type as FieldType;
    onlyProps(c, f, [...COMMON_FIELD_PROPS, ...FIELD_PROPS[type]], p);
    if (ctx.fixedKeys) {
      const permis = ctx.fixedKeys[f.key];
      if (!permis) c.add(`${p}.key`, `ce format n’a que les champs ${Object.keys(ctx.fixedKeys).join(', ')}`);
      else if (!permis.includes(type)) c.add(`${p}.type`, `« ${f.key} » : type ${permis.join(' ou ')}`);
    }
    if (ctx.textual && !(SCALAR_TYPES as readonly string[]).includes(type)) {
      c.add(`${p}.type`, `le type ${type} n’existe pas en ${ctx.format.type} (un texte par valeur)`);
    }
    if (ctx.format.type === 'keyvalue' && type === 'longtext') {
      c.add(`${p}.type`, 'clé: valeur tient une valeur par ligne : pas de texte long');
    }
    checkText(c, f.label, `${p}.label`, false);
    checkText(c, f.placeholder, `${p}.placeholder`, false);
    checkText(c, f.unit, `${p}.unit`, false, 20);
    if (type === 'number') {
      for (const k of ['min', 'max', 'step'] as const) {
        if (f[k] !== undefined && !isFiniteNumber(f[k])) c.add(`${p}.${k}`, 'un nombre');
      }
      if (isFiniteNumber(f.min) && isFiniteNumber(f.max) && f.min > f.max) c.add(`${p}.min`, 'min dépasse max');
      if (isFiniteNumber(f.step) && f.step <= 0) c.add(`${p}.step`, 'un pas positif');
      if (f.decimals !== undefined && !(Number.isInteger(f.decimals) && (f.decimals as number) >= 0 && (f.decimals as number) <= 6)) {
        c.add(`${p}.decimals`, 'un entier de 0 à 6');
      }
      if (f.decimal !== undefined && f.decimal !== ',' && f.decimal !== '.') c.add(`${p}.decimal`, '"," ou "."');
    }
    if (type === 'rating' && f.max !== undefined && !(Number.isInteger(f.max) && (f.max as number) >= 1 && (f.max as number) <= 10)) {
      c.add(`${p}.max`, 'un nombre d’étoiles de 1 à 10');
    }
    if (type === 'choice') {
      const opts = f.options;
      if (!Array.isArray(opts) || opts.length === 0 || opts.length > 50) {
        c.add(`${p}.options`, '1 à 50 options { value, label?, color? }');
      } else {
        const vals = new Set<string>();
        opts.forEach((o, j) => {
          const q = `${p}.options[${j}]`;
          if (!isRecord(o)) return c.add(q, 'un objet { value, label?, color? }');
          onlyProps(c, o, ['value', 'label', 'color'], q);
          if (typeof o.value !== 'string' || o.value.length > MAX_TEXT || /[\r\n]/.test(o.value)) {
            c.add(`${q}.value`, 'un texte d’une ligne');
          } else {
            if (vals.has(o.value)) c.add(`${q}.value`, `valeur « ${o.value} » en double`);
            vals.add(o.value);
          }
          checkText(c, o.label, `${q}.label`, false);
          if (o.color !== undefined && (typeof o.color !== 'string' || !HEX_COLOR_RE.test(o.color))) {
            c.add(`${q}.color`, 'une couleur #rrggbb');
          }
        });
      }
    }
    if (type === 'boolean') {
      for (const k of ['trueValue', 'falseValue'] as const) {
        if (f[k] !== undefined && (typeof f[k] !== 'string' || (f[k] as string).length > 40 || /[\r\n]/.test(f[k] as string))) {
          c.add(`${p}.${k}`, 'un texte d’une ligne, 40 caractères au plus');
        }
      }
      if (f.trueValue !== undefined && f.trueValue === f.falseValue) c.add(`${p}.falseValue`, 'différent de trueValue');
    }
    if (type === 'tags' && f.separator !== undefined) {
      if (typeof f.separator !== 'string' || f.separator.length < 1 || f.separator.length > 3 || /[\r\n\s]/.test(f.separator)) {
        c.add(`${p}.separator`, 'un séparateur de 1 à 3 caractères visibles');
      }
    }
    let sub: FieldDef[] | undefined;
    if (type === 'list' || type === 'object') {
      if (depth >= 3) c.add(`${p}.fields`, 'trois niveaux de listes et d’objets au plus');
      sub = checkFields(c, f.fields, `${p}.fields`, { format: ctx.format, textual: false }, depth + 1);
    }
    const def = { ...(f as unknown as FieldDef), ...(sub ? { fields: sub } : {}) };
    if (f.default !== undefined) checkDefault(c, def, f.default, `${p}.default`);
    out.push(def);
  });
  return out;
}

// ── Les blocs ───────────────────────────────────────────────────────────────

interface BlockContext {
  fields: FieldDef[];
  /** La liste implicite, au niveau racine seulement. */
  implicit: string | null;
}

function fieldAt(c: Collector, ctx: BlockContext, v: unknown, path: string, types: readonly FieldType[]): FieldDef | null {
  if (typeof v !== 'string') {
    c.add(path, 'le nom d’un champ');
    return null;
  }
  const def = resolveField(ctx.fields, v);
  if (!def) {
    c.add(path, `champ « ${v} » introuvable à ce niveau`);
    return null;
  }
  if (!types.includes(def.type)) {
    c.add(path, `« ${v} » est de type ${def.type} ; ce bloc attend ${types.join(' ou ')}`);
    return null;
  }
  return def;
}

/** La liste visée par `field`, ou la liste implicite quand il est absent. */
function listAt(c: Collector, ctx: BlockContext, v: unknown, path: string): FieldDef | null {
  if (v === undefined) {
    if (ctx.implicit) return resolveField(ctx.fields, ctx.implicit);
    c.add(path, 'champ obligatoire (une liste)');
    return null;
  }
  return fieldAt(c, ctx, v, path, ['list']);
}

function itemField(
  c: Collector,
  list: FieldDef,
  v: unknown,
  path: string,
  types: readonly FieldType[],
  what: string
): FieldDef | null {
  const items = list.fields ?? [];
  if (v === undefined) {
    const d = items.find((f) => types.includes(f.type)) ?? null;
    if (!d) c.add(path, `aucun champ ${what} dans les éléments de « ${list.key} »`);
    return d;
  }
  return fieldAt(c, { fields: items, implicit: null }, v, path, types);
}

function checkCompute(c: Collector, raw: unknown, path: string, ctx: BlockContext): void {
  if (!isRecord(raw)) return c.add(path, 'un objet { op, field?, of? }');
  onlyProps(c, raw, ['op', 'field', 'of'], path);
  const ops = ['sum', 'avg', 'min', 'max', 'count', 'countChecked', 'sumProduct'];
  if (typeof raw.op !== 'string' || !ops.includes(raw.op)) return c.add(`${path}.op`, `parmi ${ops.join(', ')}`);
  const op = raw.op as ComputeDef['op'];
  const ofList = raw.of === undefined ? [] : Array.isArray(raw.of) ? raw.of : [raw.of];
  if (!ofList.every((x) => typeof x === 'string')) return c.add(`${path}.of`, 'un champ, ou une liste de champs');
  const listMode = raw.field !== undefined || (ctx.implicit !== null && raw.of === undefined) || (ctx.implicit !== null && ofList.every((x) => !resolveField(ctx.fields, x as string)));
  if (listMode) {
    const list = listAt(c, ctx, raw.field, `${path}.field`);
    if (!list) return;
    const numeric: FieldType[] = ['number', 'rating'];
    if (op === 'count') return;
    if (op === 'countChecked') {
      if (ofList.length > 1) c.add(`${path}.of`, 'un seul champ (une case)');
      itemField(c, list, ofList[0], `${path}.of`, ['boolean'], 'case à cocher');
      return;
    }
    if (op === 'sumProduct') {
      if (ofList.length < 2 || ofList.length > 4) return c.add(`${path}.of`, '2 à 4 champs nombres');
      ofList.forEach((x, i) => itemField(c, list, x, `${path}.of[${i}]`, numeric, 'nombre'));
      return;
    }
    if (ofList.length !== 1) return c.add(`${path}.of`, 'un champ nombre des éléments');
    itemField(c, list, ofList[0], `${path}.of`, numeric, 'nombre');
    return;
  }
  // Mode « niveau » : des champs du même niveau, sans liste.
  if (ofList.length === 0) return c.add(`${path}.of`, 'les champs à combiner');
  const types: FieldType[] = op === 'countChecked' ? ['boolean'] : op === 'count' ? [...SCALAR_TYPES] : ['number', 'rating'];
  ofList.forEach((x, i) => fieldAt(c, ctx, x, `${path}.of[${i}]`, types));
}

function checkBlocks(c: Collector, raw: unknown, path: string, ctx: BlockContext, depth: number): void {
  if (!Array.isArray(raw) || raw.length === 0) return c.add(path, 'une liste de blocs non vide');
  if (raw.length > 100) c.add(path, '100 blocs au plus à un même niveau');
  if (depth > 4) return c.add(path, 'quatre niveaux de sections et de cartes au plus');
  raw.forEach((b, i) => checkBlock(c, b, `${path}[${i}]`, ctx, depth));
}

function checkBlock(c: Collector, b: unknown, p: string, ctx: BlockContext, depth: number): void {
  c.blockCount++;
  if (!isRecord(b)) return c.add(p, 'un objet { type, … }');
  const type = b.type;
  if (typeof type !== 'string' || !hasOwn(BLOCK_PROPS, type)) {
    return c.add(`${p}.type`, `type de bloc inconnu — parmi ${Object.keys(BLOCK_PROPS).join(', ')}`);
  }
  onlyProps(c, b, ['type', ...BLOCK_PROPS[type as BlockDef['type']]], p);
  if ('label' in b && type !== 'total') checkText(c, b.label, `${p}.label`, false);
  if ('addLabel' in b) checkText(c, b.addLabel, `${p}.addLabel`, false);
  const scalars = SCALAR_TYPES;
  switch (type as BlockDef['type']) {
    case 'title':
      fieldAt(c, ctx, b.field, `${p}.field`, ['text', 'longtext']);
      checkText(c, b.placeholder, `${p}.placeholder`, false);
      return;
    case 'badges': {
      const items = b.items;
      if (!Array.isArray(items) || items.length === 0 || items.length > 12) return c.add(`${p}.items`, '1 à 12 pastilles');
      items.forEach((it, j) => {
        const q = `${p}.items[${j}]`;
        if (!isRecord(it)) return c.add(q, 'un objet { field, label?, stepper? }');
        onlyProps(c, it, ['field', 'label', 'stepper'], q);
        const def = fieldAt(c, ctx, it.field, `${q}.field`, scalars.filter((t) => t !== 'longtext' && t !== 'tags'));
        checkText(c, it.label, `${q}.label`, false);
        if (it.stepper !== undefined && (typeof it.stepper !== 'boolean' || (def && def.type !== 'number'))) {
          c.add(`${q}.stepper`, 'true ou false, pour un champ nombre');
        }
      });
      return;
    }
    case 'checklist': {
      const list = listAt(c, ctx, b.field, `${p}.field`);
      if (!list) return;
      itemField(c, list, b.check, `${p}.check`, ['boolean'], 'case à cocher');
      itemField(c, list, b.text, `${p}.text`, ['text', 'longtext'], 'texte');
      return;
    }
    case 'steps': {
      const def = fieldAt(c, ctx, b.field, `${p}.field`, ['textlist', 'list']);
      if (def?.type === 'list') itemField(c, def, b.text, `${p}.text`, ['text', 'longtext'], 'texte');
      else if (b.text !== undefined) c.add(`${p}.text`, 'seulement pour une liste d’objets');
      return;
    }
    case 'longtext':
      fieldAt(c, ctx, b.field, `${p}.field`, ['text', 'longtext']);
      if (b.rows !== undefined && !(Number.isInteger(b.rows) && (b.rows as number) >= 2 && (b.rows as number) <= 30)) {
        c.add(`${p}.rows`, 'un entier de 2 à 30');
      }
      return;
    case 'number':
      fieldAt(c, ctx, b.field, `${p}.field`, ['number']);
      return;
    case 'table': {
      const list = listAt(c, ctx, b.field, `${p}.field`);
      if (!list) return;
      if (b.columns !== undefined) {
        if (!Array.isArray(b.columns) || b.columns.length === 0 || b.columns.length > 16) {
          return c.add(`${p}.columns`, '1 à 16 colonnes');
        }
        b.columns.forEach((col, j) =>
          fieldAt(c, { fields: list.fields ?? [], implicit: null }, col, `${p}.columns[${j}]`, scalars)
        );
      } else if (!(list.fields ?? []).some((f) => scalars.includes(f.type))) {
        c.add(`${p}.field`, 'aucune colonne affichable');
      }
      return;
    }
    case 'tags':
      fieldAt(c, ctx, b.field, `${p}.field`, ['tags']);
      return;
    case 'date':
      fieldAt(c, ctx, b.field, `${p}.field`, ['date']);
      return;
    case 'link':
      fieldAt(c, ctx, b.field, `${p}.field`, ['url', 'email']);
      return;
    case 'rating':
      fieldAt(c, ctx, b.field, `${p}.field`, ['rating', 'number']);
      return;
    case 'section':
      checkText(c, b.title, `${p}.title`, true);
      if (b.collapsed !== undefined && typeof b.collapsed !== 'boolean') c.add(`${p}.collapsed`, 'true ou false');
      checkBlocks(c, b.blocks, `${p}.blocks`, ctx, depth + 1);
      return;
    case 'progress': {
      if (b.max !== undefined || b.maxField !== undefined) {
        fieldAt(c, ctx, b.field, `${p}.field`, ['number', 'rating']);
        if (b.max !== undefined && !(isFiniteNumber(b.max) && b.max > 0)) c.add(`${p}.max`, 'un nombre positif');
        if (b.maxField !== undefined) fieldAt(c, ctx, b.maxField, `${p}.maxField`, ['number']);
        if (b.check !== undefined) c.add(`${p}.check`, 'seulement pour une liste');
        return;
      }
      const list = listAt(c, ctx, b.field, `${p}.field`);
      if (list) itemField(c, list, b.check, `${p}.check`, ['boolean'], 'case à cocher');
      return;
    }
    case 'total':
      checkText(c, b.label, `${p}.label`, true);
      checkText(c, b.unit, `${p}.unit`, false, 20);
      if (b.decimals !== undefined && !(Number.isInteger(b.decimals) && (b.decimals as number) >= 0 && (b.decimals as number) <= 6)) {
        c.add(`${p}.decimals`, 'un entier de 0 à 6');
      }
      checkCompute(c, b.compute, `${p}.compute`, ctx);
      return;
    case 'fields': {
      if (!Array.isArray(b.fields) || b.fields.length === 0 || b.fields.length > 32) return c.add(`${p}.fields`, '1 à 32 champs');
      b.fields.forEach((f, j) => fieldAt(c, ctx, f, `${p}.fields[${j}]`, scalars));
      return;
    }
    case 'cards': {
      const list = fieldAt(c, ctx, b.field, `${p}.field`, ['list']);
      if (list) checkBlocks(c, b.blocks, `${p}.blocks`, { fields: list.fields ?? [], implicit: null }, depth + 1);
      return;
    }
  }
}

function checkFormat(c: Collector, raw: unknown): FormatDef | null {
  if (!isRecord(raw)) {
    c.add('format', 'un objet { type, … }');
    return null;
  }
  switch (raw.type) {
    case 'json':
      onlyProps(c, raw, ['type', 'indent'], 'format');
      if (raw.indent !== undefined && ![0, 2, 4, 'tab'].includes(raw.indent as never)) c.add('format.indent', '0, 2, 4 ou "tab"');
      return raw as FormatDef;
    case 'csv':
      onlyProps(c, raw, ['type', 'delimiter'], 'format');
      if (raw.delimiter !== undefined && ![',', ';', '\t'].includes(raw.delimiter as string)) c.add('format.delimiter', '",", ";" ou "\\t"');
      return raw as FormatDef;
    case 'lines':
      onlyProps(c, raw, ['type'], 'format');
      return raw as FormatDef;
    case 'keyvalue':
      onlyProps(c, raw, ['type', 'separator', 'mode'], 'format');
      if (raw.separator !== undefined && raw.separator !== ':' && raw.separator !== '=') c.add('format.separator', '":" ou "="');
      if (raw.mode !== undefined && raw.mode !== 'fields' && raw.mode !== 'entries') c.add('format.mode', '"fields" ou "entries"');
      return raw as FormatDef;
    default:
      c.add('format.type', 'json, csv, lines ou keyvalue');
      return null;
  }
}

function checkFunctions(c: Collector, raw: unknown, ctx: BlockContext): void {
  if (raw === undefined) return;
  if (!isRecord(raw)) return c.add('functions', 'un objet { extractText?, fields?, exports? }');
  onlyProps(c, raw, ['extractText', 'fields', 'exports'], 'functions');
  if (Object.keys(raw).length === 0) c.add('functions', 'au moins une fonction, ou rien du tout');
  if (raw.extractText !== undefined && raw.extractText !== true) {
    const e = raw.extractText;
    if (!isRecord(e) || !Array.isArray(e.fields) || e.fields.length === 0 || e.fields.length > 64) {
      c.add('functions.extractText', 'true, ou { fields: [1 à 64 champs] }');
    } else {
      onlyProps(c, e, ['fields'], 'functions.extractText');
      e.fields.forEach((f, i) => {
        if (typeof f !== 'string' || !resolveField(ctx.fields, f)) c.add(`functions.extractText.fields[${i}]`, `champ « ${String(f)} » introuvable`);
      });
    }
  }
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields) || raw.fields.length === 0 || raw.fields.length > 32) {
      c.add('functions.fields', '1 à 32 colonnes { key, field | compute }');
    } else {
      const keys = new Set<string>();
      raw.fields.forEach((f, i) => {
        const p = `functions.fields[${i}]`;
        if (!isRecord(f)) return c.add(p, 'un objet { key, field | compute }');
        onlyProps(c, f, ['key', 'field', 'compute'], p);
        if (typeof f.key !== 'string' || !FUNCTION_KEY_RE.test(f.key)) c.add(`${p}.key`, 'clé ^[a-z][a-z0-9_]{0,31}$ (celle du manifeste)');
        else {
          if (keys.has(f.key)) c.add(`${p}.key`, `clé « ${f.key} » en double`);
          keys.add(f.key);
        }
        if ((f.field === undefined) === (f.compute === undefined)) return c.add(p, 'soit `field`, soit `compute`');
        if (f.field !== undefined) fieldAt(c, { ...ctx, implicit: null }, f.field, `${p}.field`, SCALAR_TYPES);
        else checkCompute(c, f.compute, `${p}.compute`, ctx);
      });
    }
  }
  if (raw.exports !== undefined) {
    if (!Array.isArray(raw.exports) || raw.exports.length === 0 || raw.exports.length > 4) {
      c.add('functions.exports', '1 à 4 exports { to, field? }');
    } else {
      const cibles = new Set<string>();
      raw.exports.forEach((e, i) => {
        const p = `functions.exports[${i}]`;
        if (!isRecord(e)) return c.add(p, 'un objet { to, field? }');
        onlyProps(c, e, ['to', 'field'], p);
        if (typeof e.to !== 'string' || !['md', 'txt', 'html', 'csv', 'json'].includes(e.to)) {
          c.add(`${p}.to`, 'md, txt, html, csv ou json');
        } else {
          if (cibles.has(e.to)) c.add(`${p}.to`, `export « ${e.to} » en double`);
          cibles.add(e.to);
        }
        if (e.field !== undefined) fieldAt(c, ctx, e.field, `${p}.field`, ['list']);
      });
    }
  }
}

export type ConfigVerdict = { ok: true; config: NocodeConfig; issues: [] } | { ok: false; issues: ConfigIssue[] };

/**
 * Valide une configuration. Ne jette jamais. La configuration rendue est
 * l'objet reçu lui-même (rien n'est réécrit, rien n'est complété) : ce que
 * Filarr montre à la relecture est exactement ce que le moteur exécute.
 */
export function validateConfig(raw: unknown): ConfigVerdict {
  const c = new Collector();
  const tree = checkValueTree(raw);
  if (!tree.ok) return { ok: false, issues: [{ path: tree.path || '(racine)', message: tree.reason }] };
  if (!isRecord(raw)) return { ok: false, issues: [{ path: '(racine)', message: 'la configuration est un objet JSON' }] };

  onlyProps(c, raw, ['$schema', 'nocode', 'id', 'format', 'fields', 'view', 'accent', 'functions'], '');
  if (raw.$schema !== undefined && (typeof raw.$schema !== 'string' || raw.$schema.length > 300)) c.add('$schema', 'une adresse');
  if (raw.nocode !== CONFIG_FORMAT) c.add('nocode', `format de configuration attendu : ${CONFIG_FORMAT}`);
  if (typeof raw.id !== 'string' || !SLUG_RE.test(raw.id)) c.add('id', 'l’identifiant du manifeste (^[a-z][a-z0-9-]{1,63}$)');
  if (raw.accent !== undefined && (typeof raw.accent !== 'string' || !HEX_COLOR_RE.test(raw.accent))) {
    c.add('accent', 'une couleur #rrggbb');
  }

  const format = checkFormat(c, raw.format);
  if (format) {
    const fixed: Record<string, readonly FieldType[]> | undefined =
      format.type === 'lines'
        ? { done: ['boolean'] as const, text: ['text'] as const }
        : format.type === 'keyvalue' && format.mode === 'entries'
          ? { key: ['text'] as const, value: ['text', 'url', 'email'] as const }
          : undefined;
    const fields = checkFields(c, raw.fields, 'fields', { format, textual: isTextualFormat(format), fixedKeys: fixed }, 0);
    if (format.type !== 'lines' && !(format.type === 'keyvalue' && format.mode === 'entries') && fields.length === 0) {
      c.add('fields', 'au moins un champ');
    }
    if (c.fieldCount > MAX_FIELDS_TOTAL) c.add('fields', `${MAX_FIELDS_TOTAL} champs au plus en tout`);
    const ctx: BlockContext = {
      fields: rootFields({ format, fields }),
      implicit: implicitListKey(format),
    };
    checkBlocks(c, raw.view, 'view', ctx, 0);
    if (c.blockCount > MAX_BLOCKS_TOTAL) c.add('view', `${MAX_BLOCKS_TOTAL} blocs au plus en tout`);
    checkFunctions(c, raw.functions, ctx);
  }

  if (c.issues.length > 0) return { ok: false, issues: c.issues };
  return { ok: true, config: raw as unknown as NocodeConfig, issues: [] };
}

/** Les colonnes que `fields` rendra, avec le type que le manifeste doit déclarer. */
export function functionFieldTypes(config: NocodeConfig): { key: string; type: ReturnType<typeof manifestFieldType> }[] {
  const root = rootFields(config);
  return (config.functions?.fields ?? []).map((f) => ({
    key: f.key,
    type: f.field !== undefined ? manifestFieldType(resolveField(root, f.field)) : 'number',
  }));
}
