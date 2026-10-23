/**
 * functions — les fonctions PURES du moteur (capacité `functions`, palier 2).
 *
 * Filarr les appelle sur les fichiers QU'IL choisit, dans une page sans aucune
 * API : des octets entrent, une valeur sort. Elles relisent le document par le
 * même chemin que l'éditeur (mêmes bornes, mêmes refus) et ne l'écrivent
 * jamais. Un document illisible fait jeter un CODE : l'hôte le traite comme un
 * échec de l'extension et retombe sur ce qu'il faisait sans elle.
 *
 * Elles n'existent que si la configuration les déclare ; le manifeste doit
 * déclarer les mêmes (`filarr-ext check` le vérifie).
 */

import type { ExportTarget, ExtensionFunctions, FieldValue, FunctionContext } from '@filarr/extension-api';
import { computeValue } from './compute';
import { openDocument, type NocodeDocument } from './formats/index';
import { readValue, resolveScope, type DocFormatContext, type Scope } from './model';
import { displayValue, outline, type OutlineNode } from './present';
import { implicitListKey, resolveField, rootFields, SCALAR_TYPES } from './schema';
import { langOf, localText } from './text';
import type { FieldDef, Lang, NocodeConfig } from './types';

const EXTRACT_MAX = 100_000;
const FIELD_TEXT_MAX = 500;
const ENC = /* @__PURE__ */ new TextEncoder();

function open(bytes: Uint8Array, config: NocodeConfig): NocodeDocument {
  const r = openDocument(bytes, config);
  if (!r.ok) throw new Error(`document_${r.code}`);
  return r.doc;
}

// ── extractText ─────────────────────────────────────────────────────────────

function collect(scope: Scope, def: FieldDef, key: string, ctx: DocFormatContext, lang: Lang, out: string[], depth: number): void {
  if (depth > 12 || out.length > 20_000) return;
  if (def.type === 'list' || def.type === 'textlist') {
    const list = scope.list(key);
    for (let i = 0; i < list.length(); i++) {
      if (def.type === 'textlist') {
        const t = list.text(i);
        if (t) out.push(t);
        continue;
      }
      const item = list.item(i);
      if (item) for (const f of def.fields ?? []) collect(item, f, f.key, ctx, lang, out, depth + 1);
    }
    return;
  }
  if (def.type === 'object') {
    const sub = scope.object(key);
    for (const f of def.fields ?? []) collect(sub, f, f.key, ctx, lang, out, depth + 1);
    return;
  }
  if (def.type === 'number' || def.type === 'rating' || def.type === 'boolean') return;
  const text = displayValue(def, readValue(def, scope.get(key), ctx), lang);
  if (text) out.push(text);
}

export function extractText(config: NocodeConfig, bytes: Uint8Array, lang: Lang): string {
  const doc = open(bytes, config);
  const out: string[] = [];
  const spec = config.functions?.extractText;
  const root = rootFields(config);
  if (spec && spec !== true) {
    for (const path of spec.fields) {
      const r = resolveScope(doc.root, path);
      if (r) collect(r.scope, r.def, r.key, doc.ctx, lang, out, 0);
    }
  } else {
    for (const f of root) collect(doc.root, f, f.key, doc.ctx, lang, out, 0);
  }
  return out.join('\n').slice(0, EXTRACT_MAX);
}

// ── fields ──────────────────────────────────────────────────────────────────

export function fieldValues(config: NocodeConfig, bytes: Uint8Array, lang: Lang): Record<string, FieldValue> {
  const doc = open(bytes, config);
  const out: Record<string, FieldValue> = {};
  const implicit = implicitListKey(config.format);
  for (const f of config.functions?.fields ?? []) {
    if (f.compute) {
      const v = computeValue(doc.root, f.compute, implicit, doc.ctx);
      out[f.key] = v === null || !Number.isFinite(v) ? null : v;
      continue;
    }
    const r = f.field ? resolveScope(doc.root, f.field) : null;
    if (!r) {
      out[f.key] = null;
      continue;
    }
    const v = readValue(r.def, r.scope.get(r.key), doc.ctx);
    switch (r.def.type) {
      case 'number':
      case 'rating':
        out[f.key] = typeof v === 'number' ? v : null;
        break;
      case 'boolean':
        out[f.key] = v === true;
        break;
      case 'date':
        out[f.key] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
        break;
      case 'url':
        out[f.key] = typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, FIELD_TEXT_MAX) : null;
        break;
      default: {
        const s = displayValue(r.def, v, lang);
        out[f.key] = s === '' ? null : s.slice(0, FIELD_TEXT_MAX);
      }
    }
  }
  return out;
}

// ── export ──────────────────────────────────────────────────────────────────

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escMd = (s: string) => s.replace(/([\\`*_[\]<>|])/g, '\\$1').replace(/^(\s*)([#>+-]|\d+\.)/gm, '$1\\$2');

function toMarkdown(nodes: OutlineNode[]): string {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'heading':
        if (n.text) out.push(`${'#'.repeat(n.level)} ${escMd(n.text)}`, '');
        break;
      case 'para':
        out.push(escMd(n.text), '');
        break;
      case 'pairs':
        for (const [k, v] of n.pairs) out.push(`- **${escMd(k)}** : ${escMd(v)}`);
        out.push('');
        break;
      case 'list':
        n.items.forEach((it, i) => {
          const puce = n.ordered ? `${i + 1}.` : '-';
          const coche = it.checked === undefined ? '' : it.checked ? '[x] ' : '[ ] ';
          out.push(`${puce} ${coche}${escMd(it.text)}`);
        });
        out.push('');
        break;
      case 'table':
        if (n.head.length === 0) break;
        out.push(`| ${n.head.map(escMd).join(' | ')} |`, `|${n.head.map(() => ' --- |').join('')}`);
        for (const r of n.rows) out.push(`| ${r.map((c) => escMd(c).replace(/\r?\n/g, ' ')).join(' | ')} |`);
        out.push('');
        break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function toText(nodes: OutlineNode[]): string {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'heading':
        if (n.text) out.push(n.level === 1 ? n.text.toUpperCase() : n.text, '');
        break;
      case 'para':
        out.push(n.text, '');
        break;
      case 'pairs':
        for (const [k, v] of n.pairs) out.push(`${k} : ${v}`);
        out.push('');
        break;
      case 'list':
        n.items.forEach((it, i) => {
          const puce = n.ordered ? `${i + 1}.` : it.checked === undefined ? '•' : it.checked ? '[x]' : '[ ]';
          out.push(`${puce} ${it.text}`);
        });
        out.push('');
        break;
      case 'table':
        out.push(n.head.join('\t'));
        for (const r of n.rows) out.push(r.join('\t'));
        out.push('');
        break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Un document HTML AUTONOME : chaque texte échappé, aucun script, aucune ressource. */
function toHtml(nodes: OutlineNode[], title: string, lang: Lang): string {
  const body: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'heading':
        if (n.text) body.push(`<h${n.level}>${escHtml(n.text)}</h${n.level}>`);
        break;
      case 'para':
        body.push(`<p>${escHtml(n.text).replace(/\r?\n/g, '<br>')}</p>`);
        break;
      case 'pairs':
        body.push('<dl>' + n.pairs.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('') + '</dl>');
        break;
      case 'list': {
        const tag = n.ordered ? 'ol' : 'ul';
        const items = n.items.map((it) => `<li>${it.checked === undefined ? '' : it.checked ? '☑ ' : '☐ '}${escHtml(it.text)}</li>`);
        body.push(`<${tag}>${items.join('')}</${tag}>`);
        break;
      }
      case 'table':
        body.push(
          '<table><thead><tr>' +
            n.head.map((h) => `<th>${escHtml(h)}</th>`).join('') +
            '</tr></thead><tbody>' +
            n.rows.map((r) => '<tr>' + r.map((c) => `<td>${escHtml(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table>'
        );
        break;
    }
  }
  return [
    '<!doctype html>',
    `<html lang="${lang}">`,
    '<head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">',
    `<title>${escHtml(title)}</title>`,
    '<style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.25rem .5rem;text-align:left}dt{font-weight:600}dd{margin:0 0 .4rem}</style>',
    '</head><body>',
    ...body,
    '</body></html>',
    '',
  ].join('\n');
}

const csvCell = (v: string) => (/[",;\r\n]/.test(v) || v.trim() !== v ? `"${v.replace(/"/g, '""')}"` : v);

function listToCsv(scope: Scope, key: string, ctx: DocFormatContext, lang: Lang): string {
  const list = scope.list(key);
  const cols = (list.def.fields ?? []).filter((f) => SCALAR_TYPES.includes(f.type));
  const lignes = [cols.map((c) => csvCell(c.key)).join(',')];
  for (let i = 0; i < list.length(); i++) {
    const item = list.item(i);
    if (!item) continue;
    lignes.push(
      cols
        .map((c) => {
          const v = readValue(c, item.get(c.key), ctx);
          const s = c.type === 'number' || c.type === 'rating' ? (typeof v === 'number' ? String(v) : '') : c.type === 'boolean' ? (v ? 'true' : 'false') : displayValue(c, v, lang);
          return csvCell(s);
        })
        .join(',')
    );
  }
  return lignes.join('\n') + '\n';
}

function scopeToPlain(scope: Scope, fields: readonly FieldDef[], ctx: DocFormatContext, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (depth > 12) break;
    if (f.type === 'list') {
      const list = scope.list(f.key);
      const items: unknown[] = [];
      for (let i = 0; i < list.length(); i++) {
        const item = list.item(i);
        items.push(item ? scopeToPlain(item, f.fields ?? [], ctx, depth + 1) : null);
      }
      out[f.key] = items;
    } else if (f.type === 'object') {
      out[f.key] = scopeToPlain(scope.object(f.key), f.fields ?? [], ctx, depth + 1);
    } else {
      out[f.key] = readValue(f, scope.get(f.key), ctx);
    }
  }
  return out;
}

export function exportDocument(config: NocodeConfig, bytes: Uint8Array, to: ExportTarget, lang: Lang, fileName: string): Uint8Array {
  const decl = config.functions?.exports?.find((e) => e.to === to);
  if (!decl) throw new Error('export_unsupported');
  const doc = open(bytes, config);
  const title = fileName.replace(/\.[^.]+$/, '') || fileName;
  switch (to) {
    case 'json':
      // Le JSON d'un document JSON, c'est lui-même : rien n'est perdu.
      if (config.format.type === 'json') return doc.serialize();
      return ENC.encode(JSON.stringify(scopeToPlain(doc.root, doc.root.fields, doc.ctx), null, 2) + '\n');
    case 'csv': {
      if (config.format.type === 'csv' && decl.field === undefined) {
        const bytes = doc.serialize();
        // Un tableau neuf s'exporte au moins avec son en-tête.
        return bytes.byteLength > 0 ? bytes : ENC.encode(`${config.fields.map((f) => csvCell(f.key)).join(config.format.delimiter ?? ',')}\n`);
      }
      const key = decl.field ?? implicitListKey(config.format);
      if (key && resolveField(doc.root.fields, key)?.type === 'list') return ENC.encode(listToCsv(doc.root, key, doc.ctx, lang));
      // Un document sans liste : deux colonnes, champ et valeur.
      const lignes = ['champ,valeur'];
      for (const f of config.fields) {
        if (!SCALAR_TYPES.includes(f.type)) continue;
        lignes.push(`${csvCell(localText(f.label, lang, f.key))},${csvCell(displayValue(f, readValue(f, doc.root.get(f.key), doc.ctx), lang))}`);
      }
      return ENC.encode(lignes.join('\n') + '\n');
    }
    case 'md':
      return ENC.encode(toMarkdown(outline(config, doc.root, doc.ctx, lang, title)));
    case 'txt':
      return ENC.encode(toText(outline(config, doc.root, doc.ctx, lang, title)));
    case 'html':
      return ENC.encode(toHtml(outline(config, doc.root, doc.ctx, lang, title), title, lang));
  }
}

/** Les fonctions que la configuration déclare, au format de `plugin.functions`. */
export function makeFunctions(config: NocodeConfig): ExtensionFunctions | undefined {
  const f = config.functions;
  if (!f) return undefined;
  const out: ExtensionFunctions = {};
  if (f.extractText) out.extractText = (bytes: Uint8Array, ctx: FunctionContext) => extractText(config, bytes, langOf(ctx.locale));
  if (f.fields) out.fields = (bytes: Uint8Array, ctx: FunctionContext) => fieldValues(config, bytes, langOf(ctx.locale));
  if (f.exports) {
    out.export = (bytes: Uint8Array, ctx: FunctionContext & { to: ExportTarget }) =>
      exportDocument(config, bytes, ctx.to, langOf(ctx.locale), String(ctx.fileName ?? ''));
  }
  return out;
}
