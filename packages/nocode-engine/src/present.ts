/**
 * present — une valeur typée en TEXTE lisible, et la vue en plan simple.
 *
 * Partagé par l'interface (pastilles, totaux) et par les fonctions pures
 * (recherche, export) : ce qu'on exporte est ce qu'on voit.
 */

import { computeValue, progressOf } from './compute';
import { readValue, resolveScope, type DocFormatContext, type Scope } from './model';
import { implicitListKey, SCALAR_TYPES } from './schema';
import { localText, words } from './text';
import type { BlockDef, FieldDef, Lang, NocodeConfig } from './types';

export function formatNumberFor(n: number, lang: Lang, decimals?: number): string {
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
      maximumFractionDigits: decimals ?? 2,
      minimumFractionDigits: decimals !== undefined ? decimals : 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

export function fieldLabel(def: FieldDef, lang: Lang): string {
  return localText(def.label, lang, def.key);
}

/** Le texte d'une valeur typée, tel qu'on l'affiche hors d'un champ de saisie. */
export function displayValue(def: FieldDef, value: unknown, lang: Lang): string {
  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number') return '';
      const s = formatNumberFor(value, lang, def.decimals);
      const unit = localText(def.unit, lang);
      return unit ? `${s} ${unit}` : s;
    }
    case 'rating':
      return typeof value === 'number' ? words(lang).stars(value, def.max ?? 5) : '';
    case 'boolean':
      return value === true ? '✓' : '—';
    case 'choice': {
      const opt = def.options?.find((o) => o.value === value);
      return opt ? localText(opt.label, lang, opt.value) : typeof value === 'string' ? value : '';
    }
    case 'tags':
    case 'textlist':
      return Array.isArray(value) ? value.join(', ') : '';
    case 'list':
    case 'object':
      return '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

export function typedAt(scope: Scope, path: string, ctx: DocFormatContext): { def: FieldDef; value: unknown } | null {
  const r = resolveScope(scope, path);
  if (!r) return null;
  return { def: r.def, value: readValue(r.def, r.scope.get(r.key), ctx) };
}

// ── Le plan : la vue sans interface ─────────────────────────────────────────

export type OutlineNode =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; checked?: boolean }[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'pairs'; pairs: [string, string][] };

interface OutlineCtx {
  config: NocodeConfig;
  ctx: DocFormatContext;
  lang: Lang;
  fileName: string;
}

function itemText(item: Scope, key: string | undefined, o: OutlineCtx): string {
  if (!key) return '';
  const t = typedAt(item, key, o.ctx);
  return t ? displayValue(t.def, t.value, o.lang) : '';
}

function firstKey(fields: readonly FieldDef[] | undefined, types: string[]): string | undefined {
  return fields?.find((f) => types.includes(f.type))?.key;
}

function outlineBlocks(blocks: BlockDef[], scope: Scope, implicit: string | null, o: OutlineCtx, out: OutlineNode[], depth: number): void {
  const pairs: [string, string][] = [];
  const flushPairs = () => {
    if (pairs.length) out.push({ kind: 'pairs', pairs: pairs.splice(0) });
  };
  const pair = (path: string, label?: string) => {
    const t = typedAt(scope, path, o.ctx);
    if (!t) return;
    const v = displayValue(t.def, t.value, o.lang);
    if (v !== '') pairs.push([label ?? fieldLabel(t.def, o.lang), v]);
  };
  for (const b of blocks) {
    switch (b.type) {
      case 'title': {
        flushPairs();
        const t = typedAt(scope, b.field, o.ctx);
        const text = t ? displayValue(t.def, t.value, o.lang) : '';
        out.push({ kind: 'heading', level: depth === 0 ? 1 : 3, text: text || (depth === 0 ? o.fileName : '') });
        break;
      }
      case 'badges':
        for (const it of b.items) pair(it.field, it.label ? localText(it.label, o.lang) : undefined);
        break;
      case 'number':
      case 'date':
      case 'link':
      case 'rating':
      case 'tags':
        pair(b.field, b.label ? localText(b.label, o.lang) : undefined);
        break;
      case 'fields':
        for (const f of b.fields) pair(f);
        break;
      case 'longtext': {
        const t = typedAt(scope, b.field, o.ctx);
        const text = t ? displayValue(t.def, t.value, o.lang) : '';
        if (text === '') break;
        flushPairs();
        out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: b.label ? localText(b.label, o.lang) : t ? fieldLabel(t.def, o.lang) : '' });
        out.push({ kind: 'para', text });
        break;
      }
      case 'checklist': {
        flushPairs();
        const list = scope.list(b.field ?? implicit ?? '');
        const check = b.check ?? firstKey(list.def.fields, ['boolean']);
        const textKey = b.text ?? firstKey(list.def.fields, ['text', 'longtext']);
        const items: { text: string; checked?: boolean }[] = [];
        for (let i = 0; i < list.length(); i++) {
          const item = list.item(i);
          if (!item) continue;
          const c = check ? typedAt(item, check, o.ctx) : null;
          items.push({ text: itemText(item, textKey, o), checked: c?.value === true });
        }
        if (b.label) out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: localText(b.label, o.lang) });
        out.push({ kind: 'list', ordered: false, items });
        break;
      }
      case 'steps': {
        flushPairs();
        const list = scope.list(b.field);
        const items: { text: string }[] = [];
        for (let i = 0; i < list.length(); i++) {
          if (list.def.type === 'textlist') items.push({ text: list.text(i) });
          else {
            const item = list.item(i);
            if (item) items.push({ text: itemText(item, b.text ?? firstKey(list.def.fields, ['text', 'longtext']), o) });
          }
        }
        if (b.label) out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: localText(b.label, o.lang) });
        out.push({ kind: 'list', ordered: true, items });
        break;
      }
      case 'table': {
        flushPairs();
        const list = scope.list(b.field ?? implicit ?? '');
        const cols = (b.columns ?? (list.def.fields ?? []).filter((f) => SCALAR_TYPES.includes(f.type)).map((f) => f.key))
          .map((k) => (list.def.fields ?? []).find((f) => f.key === k))
          .filter((f): f is FieldDef => f !== undefined);
        const rows: string[][] = [];
        for (let i = 0; i < list.length(); i++) {
          const item = list.item(i);
          if (item) rows.push(cols.map((c) => itemText(item, c.key, o)));
        }
        if (b.label) out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: localText(b.label, o.lang) });
        out.push({ kind: 'table', head: cols.map((c) => fieldLabel(c, o.lang)), rows });
        break;
      }
      case 'progress': {
        const p = progressOf(scope, b, implicit, o.ctx);
        if (p) pairs.push([b.label ? localText(b.label, o.lang) : '%', `${formatNumberFor(p.value, o.lang)} / ${formatNumberFor(p.max, o.lang)}`]);
        break;
      }
      case 'total': {
        const v = computeValue(scope, b.compute, implicit, o.ctx);
        const unit = localText(b.unit, o.lang);
        if (v !== null) pairs.push([localText(b.label, o.lang), `${formatNumberFor(v, o.lang, b.decimals)}${unit ? ` ${unit}` : ''}`]);
        break;
      }
      case 'section':
        flushPairs();
        out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: localText(b.title, o.lang) });
        outlineBlocks(b.blocks, scope, implicit, o, out, depth + 1);
        break;
      case 'cards': {
        flushPairs();
        if (b.label) out.push({ kind: 'heading', level: depth === 0 ? 2 : 3, text: localText(b.label, o.lang) });
        const list = scope.list(b.field);
        for (let i = 0; i < list.length(); i++) {
          const item = list.item(i);
          if (item) outlineBlocks(b.blocks, item, null, o, out, depth + 1);
        }
        break;
      }
    }
  }
  flushPairs();
}

export function outline(config: NocodeConfig, root: Scope, ctx: DocFormatContext, lang: Lang, fileName: string): OutlineNode[] {
  const out: OutlineNode[] = [];
  outlineBlocks(config.view, root, implicitListKey(config.format), { config, ctx, lang, fileName }, out, 0);
  return out;
}
