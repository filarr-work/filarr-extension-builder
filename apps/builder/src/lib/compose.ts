/**
 * compose — la vue d'une extension sans code : la palette des seize blocs du
 * moteur, une première vue proposée à partir des champs, et les opérations sur
 * l'arbre des blocs (ajouter, déplacer, retirer, régler).
 *
 * Les règles de compatibilité bloc ↔ champ sont celles de `schema.ts` du
 * moteur (la table de docs/nocode.md §5) : l'atelier ne propose que des liens
 * que le moteur acceptera, et `validateConfig` reste le juge final.
 */

import {
  implicitListKey,
  resolveField,
  rootFields,
  type BlockDef,
  type BlockType,
  type FieldDef,
  type FieldType,
  type LocalText,
  type NocodeConfig,
} from '@filarr/nocode-engine';

export const SCALAR: FieldType[] = ['text', 'longtext', 'number', 'boolean', 'date', 'url', 'email', 'choice', 'tags', 'rating'];
const BADGE: FieldType[] = SCALAR.filter((t) => t !== 'longtext' && t !== 'tags');

type L = { fr: string; en: string };

export interface PaletteEntry {
  type: BlockType;
  glyph: string;
  name: L;
  /** Les types de champ que `field` peut viser (vide : pas de champ direct). */
  accepts: FieldType[];
}

export const PALETTE: PaletteEntry[] = [
  { type: 'title', glyph: 'T', name: { fr: 'Titre', en: 'Title' }, accepts: ['text', 'longtext'] },
  { type: 'badges', glyph: '••', name: { fr: 'Pastilles', en: 'Badges' }, accepts: BADGE },
  { type: 'checklist', glyph: '[x]', name: { fr: 'Liste à cocher', en: 'Checklist' }, accepts: ['list'] },
  { type: 'steps', glyph: '1.', name: { fr: 'Étapes numérotées', en: 'Numbered steps' }, accepts: ['textlist', 'list'] },
  { type: 'longtext', glyph: '¶', name: { fr: 'Texte long', en: 'Long text' }, accepts: ['text', 'longtext'] },
  { type: 'number', glyph: '12', name: { fr: 'Nombre', en: 'Number' }, accepts: ['number'] },
  { type: 'table', glyph: '▦', name: { fr: 'Tableau', en: 'Table' }, accepts: ['list'] },
  { type: 'fields', glyph: '‖', name: { fr: 'Formulaire', en: 'Form' }, accepts: SCALAR },
  { type: 'tags', glyph: '#', name: { fr: 'Étiquettes', en: 'Tags' }, accepts: ['tags'] },
  { type: 'date', glyph: 'j/m', name: { fr: 'Date', en: 'Date' }, accepts: ['date'] },
  { type: 'link', glyph: '↗', name: { fr: 'Lien', en: 'Link' }, accepts: ['url', 'email'] },
  { type: 'rating', glyph: '★', name: { fr: 'Note en étoiles', en: 'Star rating' }, accepts: ['rating', 'number'] },
  { type: 'progress', glyph: '%', name: { fr: 'Progression', en: 'Progress' }, accepts: ['list', 'number', 'rating'] },
  { type: 'total', glyph: 'Σ', name: { fr: 'Total calculé', en: 'Computed total' }, accepts: [] },
  { type: 'section', glyph: '§', name: { fr: 'Section repliable', en: 'Collapsible section' }, accepts: [] },
  { type: 'cards', glyph: '▤', name: { fr: 'Cartes', en: 'Cards' }, accepts: ['list'] },
];

export const paletteEntry = (t: BlockType) => PALETTE.find((p) => p.type === t)!;

/** Un chemin dans l'arbre : indices, en traversant `blocks` des sections et des cartes. */
export type BlockPath = number[];

export interface Level {
  fields: FieldDef[];
  implicit: string | null;
}

export function rootLevel(config: Pick<NocodeConfig, 'format' | 'fields'>): Level {
  return { fields: rootFields(config), implicit: implicitListKey(config.format) };
}

/** Les champs visibles au niveau d'un bloc (la racine, ou l'élément d'une liste de cartes). */
export function levelAt(config: NocodeConfig, path: BlockPath): Level {
  let level = rootLevel(config);
  let blocks: BlockDef[] = config.view;
  for (let i = 0; i < path.length - 1; i++) {
    const b = blocks[path[i]];
    if (!b) break;
    if (b.type === 'cards') {
      const list = resolveField(level.fields, b.field);
      level = { fields: list?.fields ?? [], implicit: null };
      blocks = b.blocks;
    } else if (b.type === 'section') blocks = b.blocks;
    else break;
  }
  return level;
}

/** Les chemins de champs d'un niveau, à travers les `object`, filtrés par type. */
export function fieldPaths(fields: FieldDef[], types: FieldType[], prefix = ''): { path: string; def: FieldDef }[] {
  const out: { path: string; def: FieldDef }[] = [];
  for (const f of fields) {
    const p = prefix ? `${prefix}.${f.key}` : f.key;
    if (types.includes(f.type)) out.push({ path: p, def: f });
    if (f.type === 'object') out.push(...fieldPaths(f.fields ?? [], types, p));
  }
  return out;
}

export function itemFields(level: Level, listPath: string | undefined, types: FieldType[]): FieldDef[] {
  const list = listPath ? resolveField(level.fields, listPath) : level.implicit ? resolveField(level.fields, level.implicit) : null;
  return (list?.fields ?? []).filter((f) => types.includes(f.type));
}

// ── L'arbre ─────────────────────────────────────────────────────────────────

function childrenOf(b: BlockDef | undefined): BlockDef[] | null {
  return b && (b.type === 'section' || b.type === 'cards') ? b.blocks : null;
}

export function blockAt(view: BlockDef[], path: BlockPath): BlockDef | undefined {
  let blocks: BlockDef[] | null = view;
  let b: BlockDef | undefined;
  for (const i of path) {
    if (!blocks) return undefined;
    b = blocks[i];
    blocks = childrenOf(b);
  }
  return b;
}

/** Une copie de la vue où la liste qui contient `path` est transformée. */
function editList(view: BlockDef[], parent: BlockPath, fn: (list: BlockDef[]) => BlockDef[]): BlockDef[] {
  if (parent.length === 0) return fn([...view]);
  const [head, ...rest] = parent;
  return view.map((b, i) => {
    if (i !== head) return b;
    const kids = childrenOf(b) ?? [];
    return { ...b, blocks: editList(kids, rest, fn) } as BlockDef;
  });
}

export function updateBlock(view: BlockDef[], path: BlockPath, fn: (b: BlockDef) => BlockDef): BlockDef[] {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1];
  return editList(view, parent, (list) => list.map((b, i) => (i === idx ? fn(b) : b)));
}

export function removeBlock(view: BlockDef[], path: BlockPath): BlockDef[] {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1];
  return editList(view, parent, (list) => list.filter((_, i) => i !== idx));
}

export function insertBlock(view: BlockDef[], parent: BlockPath, index: number, block: BlockDef): BlockDef[] {
  return editList(view, parent, (list) => {
    list.splice(Math.max(0, Math.min(index, list.length)), 0, block);
    return list;
  });
}

/** Déplace un bloc d'un cran dans sa liste ; rend le nouveau chemin. */
export function moveBlock(view: BlockDef[], path: BlockPath, delta: -1 | 1): { view: BlockDef[]; path: BlockPath } {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1];
  let next = idx;
  const v = editList(view, parent, (list) => {
    const to = idx + delta;
    if (to < 0 || to >= list.length) return list;
    [list[idx], list[to]] = [list[to], list[idx]];
    next = to;
    return list;
  });
  return { view: v, path: [...parent, next] };
}

/** Déplace un bloc vers une autre position de la MÊME liste (glisser-déposer). */
export function reorderBlock(view: BlockDef[], parent: BlockPath, from: number, to: number): BlockDef[] {
  return editList(view, parent, (list) => {
    const [b] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, b);
    return list;
  });
}

// ── Créer un bloc ───────────────────────────────────────────────────────────

const lt = (fr: string, en: string): LocalText => ({ fr, en });

/** Un bloc neuf, relié au premier champ compatible du niveau — `null` s'il n'y en a aucun. */
export function createBlock(type: BlockType, level: Level, preferred?: string): BlockDef | null {
  const pick = (types: FieldType[]) => {
    const all = fieldPaths(level.fields, types);
    return (preferred && all.find((x) => x.path === preferred)) || all[0] || null;
  };
  const implicitList = level.implicit ? resolveField(level.fields, level.implicit) : null;
  switch (type) {
    case 'title': {
      const f = pick(['text', 'longtext']);
      return f ? { type, field: f.path } : null;
    }
    case 'badges': {
      const fs = fieldPaths(level.fields, BADGE).slice(0, 3);
      return fs.length ? { type, items: fs.map((f) => ({ field: f.path, ...(f.def.type === 'number' ? { stepper: true } : {}) })) } : null;
    }
    case 'checklist': {
      const lists = fieldPaths(level.fields, ['list']).filter((l) => (l.def.fields ?? []).some((x) => x.type === 'boolean') && (l.def.fields ?? []).some((x) => x.type === 'text' || x.type === 'longtext'));
      const f = (preferred && lists.find((x) => x.path === preferred)) || lists[0];
      if (!f) return null;
      return level.implicit === f.path ? { type } : { type, field: f.path };
    }
    case 'steps': {
      const lists = fieldPaths(level.fields, ['textlist', 'list']).filter((l) => l.def.type === 'textlist' || (l.def.fields ?? []).some((x) => x.type === 'text' || x.type === 'longtext'));
      const f = (preferred && lists.find((x) => x.path === preferred)) || lists[0];
      return f ? { type, field: f.path } : null;
    }
    case 'longtext': {
      const f = pick(['longtext', 'text']);
      return f ? { type, field: f.path } : null;
    }
    case 'number': {
      const f = pick(['number']);
      return f ? { type, field: f.path } : null;
    }
    case 'table': {
      const lists = fieldPaths(level.fields, ['list']).filter((l) => (l.def.fields ?? []).some((x) => SCALAR.includes(x.type)));
      const f = (preferred && lists.find((x) => x.path === preferred)) || lists[0];
      if (!f) return null;
      return level.implicit === f.path ? { type } : { type, field: f.path };
    }
    case 'fields': {
      const fs = fieldPaths(level.fields, SCALAR).slice(0, 32);
      return fs.length ? { type, fields: fs.map((f) => f.path) } : null;
    }
    case 'tags': {
      const f = pick(['tags']);
      return f ? { type, field: f.path } : null;
    }
    case 'date': {
      const f = pick(['date']);
      return f ? { type, field: f.path } : null;
    }
    case 'link': {
      const f = pick(['url', 'email']);
      return f ? { type, field: f.path } : null;
    }
    case 'rating': {
      const f = pick(['rating', 'number']);
      return f ? { type, field: f.path } : null;
    }
    case 'progress': {
      const lists = fieldPaths(level.fields, ['list']).filter((l) => (l.def.fields ?? []).some((x) => x.type === 'boolean'));
      if (lists.length) return level.implicit === lists[0].path ? { type } : { type, field: lists[0].path };
      const n = pick(['number', 'rating']);
      return n ? { type, field: n.path, max: n.def.type === 'rating' ? (n.def.max ?? 5) : (n.def.max ?? 100) } : null;
    }
    case 'total': {
      if (implicitList) {
        const num = (implicitList.fields ?? []).find((x) => x.type === 'number' || x.type === 'rating');
        return num ? { type, label: lt(`Total ${num.key}`, `Total ${num.key}`), compute: { op: 'sum', of: num.key } } : { type, label: lt('Éléments', 'Items'), compute: { op: 'count' } };
      }
      const list = fieldPaths(level.fields, ['list'])[0];
      if (list) {
        const num = (list.def.fields ?? []).find((x) => x.type === 'number' || x.type === 'rating');
        return num
          ? { type, label: lt(`Total ${num.key}`, `Total ${num.key}`), compute: { op: 'sum', field: list.path, of: num.key } }
          : { type, label: lt('Éléments', 'Items'), compute: { op: 'count', field: list.path } };
      }
      const nums = fieldPaths(level.fields, ['number', 'rating']);
      return nums.length ? { type, label: lt('Total', 'Total'), compute: { op: 'sum', of: nums.map((n) => n.path) } } : null;
    }
    case 'section': {
      const inner = createBlock('fields', level) ?? createBlock('title', level);
      return inner ? { type, title: lt('Section', 'Section'), blocks: [inner] } : null;
    }
    case 'cards': {
      const f = (preferred && fieldPaths(level.fields, ['list']).find((x) => x.path === preferred)) || fieldPaths(level.fields, ['list']).find((x) => x.path !== level.implicit) || fieldPaths(level.fields, ['list'])[0];
      if (!f) return null;
      const sub: Level = { fields: f.def.fields ?? [], implicit: null };
      const inner = [createBlock('title', sub), createBlock('badges', sub)].filter((b): b is BlockDef => b !== null);
      const blocks = inner.length ? inner : [createBlock('fields', sub)].filter((b): b is BlockDef => b !== null);
      return blocks.length ? { type, field: f.path, blocks } : null;
    }
  }
}

// ── Une première vue ────────────────────────────────────────────────────────

/** Une vue proposée à partir des champs : titre, pastilles, listes, textes — toujours valide si non vide. */
export function defaultView(config: Pick<NocodeConfig, 'format' | 'fields'>): BlockDef[] {
  const level = rootLevel(config);
  const view: BlockDef[] = [];
  const used = new Set<string>();
  const add = (b: BlockDef | null, ...keys: string[]) => {
    if (b) {
      view.push(b);
      keys.forEach((k) => used.add(k));
    }
  };
  if (level.implicit) {
    const list = resolveField(level.fields, level.implicit);
    const items = list?.fields ?? [];
    const hasCheck = items.some((f) => f.type === 'boolean');
    const hasText = items.some((f) => f.type === 'text' || f.type === 'longtext');
    if (config.format.type === 'lines' || (hasCheck && hasText && items.length <= 3)) {
      add({ type: 'progress' });
      add({ type: 'checklist' });
      return view;
    }
    add(createBlock('table', level));
    const nums = items.filter((f) => f.type === 'number');
    for (const n of nums.slice(0, 2)) add({ type: 'total', label: (n.label as LocalText) ?? n.key, compute: { op: 'sum', of: n.key } });
    return view;
  }
  const fields = level.fields;
  const title = fields.find((f) => f.type === 'text');
  if (title) add({ type: 'title', field: title.key }, title.key);
  const badges = fields.filter((f) => !used.has(f.key) && ['choice', 'number', 'date', 'boolean'].includes(f.type)).slice(0, 4);
  if (badges.length) add({ type: 'badges', items: badges.map((f) => ({ field: f.key, ...(f.type === 'number' ? { stepper: true } : {}) })) }, ...badges.map((f) => f.key));
  for (const f of fields) {
    if (used.has(f.key)) continue;
    const label = f.label as LocalText | undefined;
    if (f.type === 'list') {
      const sub = f.fields ?? [];
      const check = sub.find((x) => x.type === 'boolean');
      const txt = sub.find((x) => x.type === 'text' || x.type === 'longtext');
      if (check && txt) {
        add({ type: 'checklist', field: f.key, check: check.key, text: txt.key, ...(label ? { label } : {}) }, f.key);
      } else if (sub.length === 1 && txt) {
        add({ type: 'steps', field: f.key, text: txt.key, ...(label ? { label } : {}) }, f.key);
      } else if (sub.some((x) => SCALAR.includes(x.type))) {
        add({ type: 'table', field: f.key, columns: sub.filter((x) => SCALAR.includes(x.type)).slice(0, 16).map((x) => x.key), ...(label ? { label } : {}) }, f.key);
      }
    } else if (f.type === 'textlist') add({ type: 'steps', field: f.key, ...(label ? { label } : {}) }, f.key);
    else if (f.type === 'tags') add({ type: 'tags', field: f.key, ...(label ? { label } : {}) }, f.key);
    else if (f.type === 'rating') add({ type: 'rating', field: f.key, ...(label ? { label } : {}) }, f.key);
    else if (f.type === 'url' || f.type === 'email') add({ type: 'link', field: f.key, ...(label ? { label } : {}) }, f.key);
    else if (f.type === 'object') {
      const sub = fieldPaths(f.fields ?? [], SCALAR, f.key).slice(0, 32);
      if (sub.length) add({ type: 'fields', fields: sub.map((s) => s.path), ...(label ? { label } : {}) }, f.key);
    }
  }
  const rest = fields.filter((f) => !used.has(f.key) && SCALAR.includes(f.type) && f.type !== 'longtext');
  if (rest.length) add({ type: 'fields', fields: rest.slice(0, 32).map((f) => f.key) }, ...rest.map((f) => f.key));
  for (const f of fields) if (!used.has(f.key) && f.type === 'longtext') add({ type: 'longtext', field: f.key, ...(f.label ? { label: f.label as LocalText } : {}) }, f.key);
  return view;
}

// ── Lire un bloc ────────────────────────────────────────────────────────────

export function localText(t: LocalText | undefined, lang: 'fr' | 'en'): string {
  if (t === undefined) return '';
  return typeof t === 'string' ? t : (t[lang] ?? t.fr ?? t.en ?? '');
}

/** Ce que vise un bloc, comme l'étiquette de la maquette : « categorie, portions, temps », « ingredients[] ». */
export function blockTarget(b: BlockDef, implicit: string | null, lang: 'fr' | 'en' = 'fr'): string {
  const list = (f?: string) => `${f ?? implicit ?? '?'}[]`;
  switch (b.type) {
    case 'badges':
      return b.items.map((i) => i.field).join(', ');
    case 'checklist':
    case 'table':
      return list(b.field);
    case 'progress':
      return b.max !== undefined || b.maxField !== undefined ? (b.field ?? '') : list(b.field);
    case 'steps':
      return `${b.field}[]`;
    case 'cards':
      return `${b.field}[]`;
    case 'fields':
      return b.fields.join(', ');
    case 'total':
      return `${b.compute.op}(${[b.compute.field, ...(Array.isArray(b.compute.of) ? b.compute.of : b.compute.of ? [b.compute.of] : [])].filter(Boolean).join(', ')})`;
    case 'section':
      return localText(b.title, lang);
    default:
      return b.field;
  }
}

/** Le chemin de bloc de la vue (`view[2].blocks[0]`) que cite une erreur du moteur. */
export function configPathOf(path: BlockPath): string {
  return path.map((i, k) => (k === 0 ? `view[${i}]` : `blocks[${i}]`)).join('.');
}
