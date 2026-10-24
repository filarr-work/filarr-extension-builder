/**
 * infer — deviner le format et les champs d'un fichier d'exemple.
 *
 * Deviner, pas décider : l'auteur corrige tout dans le tableau des champs.
 * Les règles restent simples et prévisibles — un type par valeur observée,
 * jamais de magie sur le contenu — et tout ce qui ne trouve pas de type
 * équivalent (liste de nombres, clé avec un point…) est SIGNALÉ, puis laissé
 * tel quel : le moteur réécrit à l'identique ce que la vue n'affiche pas.
 */

import { FORBIDDEN_KEYS, scanJson, type FieldDef, type FieldType, type FormatDef } from '@filarr/nocode-engine';
import {
  detectDelimiter,
  detectKeyValueSeparator,
  LINE_ITEM_RE,
  MAX_SAMPLE_BYTES,
  parseCsv,
  parseKeyValue,
} from './textformats';

export interface InferResult {
  format: FormatDef;
  fields: FieldDef[];
  /** Ce qui a été laissé de côté, et pourquoi (affiché sous le tableau). */
  notes: string[];
  /** Les valeurs texte vues par chemin : de quoi proposer les options d'un « choix ». */
  values: Record<string, string[]>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAG_HINT = /(tag|etiquette|étiquette|label|mot|keyword|categories)/i;
const MAX_LEVELS = 3;

/** Un libellé lisible à partir d'une clé : `date_naissance` → « Date naissance ». */
export function humanize(key: string): string {
  const s = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  const out = s.charAt(0).toUpperCase() + s.slice(1);
  return out.slice(0, 200) || key;
}

/** Une clé que le moteur accepte (sans point, pas `__proto__`…). */
export function isUsableKey(k: string): boolean {
  return k.length >= 1 && k.length <= 64 && k.trim() === k && !k.includes('.') && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(k) && !FORBIDDEN_KEYS.includes(k);
}

function stringType(values: string[]): FieldType {
  const v = values.filter((x) => x !== '');
  if (v.length === 0) return 'text';
  if (v.every((x) => DATE_RE.test(x))) return 'date';
  if (v.every((x) => URL_RE.test(x))) return 'url';
  if (v.every((x) => EMAIL_RE.test(x))) return 'email';
  if (v.some((x) => x.includes('\n') || x.length > 120)) return 'longtext';
  return 'text';
}

// ── JSON ────────────────────────────────────────────────────────────────────

function record(values: Record<string, string[]>, path: string, v: string): void {
  const list = (values[path] ??= []);
  if (list.length < 50 && !list.includes(v)) list.push(v);
}

function inferJsonField(key: string, samples: unknown[], path: string, depth: number, notes: string[], values: Record<string, string[]>): FieldDef | null {
  const seen = samples.filter((s) => s !== undefined && s !== null);
  const label = humanize(key);
  if (seen.length === 0) return { key, type: 'text', label };
  const first = seen[0];
  if (typeof first === 'string') {
    const strs = seen.filter((s): s is string => typeof s === 'string');
    strs.forEach((s) => record(values, path, s));
    return { key, type: stringType(strs), label };
  }
  if (typeof first === 'number') return { key, type: 'number', label, ...(seen.every((n) => Number.isInteger(n)) ? { step: 1 } : {}) };
  if (typeof first === 'boolean') return { key, type: 'boolean', label };
  if (Array.isArray(first)) {
    const items = seen.flatMap((s) => (Array.isArray(s) ? s : []));
    if (items.length === 0) return { key, type: 'textlist', label };
    if (items.every((x) => typeof x === 'string')) {
      const strs = items as string[];
      const avg = strs.reduce((n, s) => n + s.length, 0) / strs.length;
      const tags = TAG_HINT.test(key) || (avg <= 20 && strs.every((s) => !s.includes('\n')));
      return { key, type: tags ? 'tags' : 'textlist', label };
    }
    if (items.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      if (depth >= MAX_LEVELS) {
        notes.push(`« ${path} » : trop imbriqué (trois niveaux de listes au plus), laissé tel quel`);
        return null;
      }
      const sub = inferJsonObject(items as Record<string, unknown>[], `${path}[]`, depth + 1, notes, values);
      if (sub.length === 0) {
        notes.push(`« ${path} » : éléments sans champ utilisable, laissés tels quels`);
        return null;
      }
      return { key, type: 'list', label, fields: sub };
    }
    notes.push(`« ${path} » : liste de valeurs sans type équivalent (nombres, listes mélangées), laissée telle quelle`);
    return null;
  }
  if (typeof first === 'object') {
    if (depth >= MAX_LEVELS) {
      notes.push(`« ${path} » : trop imbriqué, laissé tel quel`);
      return null;
    }
    const sub = inferJsonObject(seen.filter((s) => typeof s === 'object' && !Array.isArray(s)) as Record<string, unknown>[], path, depth + 1, notes, values);
    if (sub.length === 0) return null;
    return { key, type: 'object', label, fields: sub };
  }
  return null;
}

function inferJsonObject(objects: Record<string, unknown>[], prefix: string, depth: number, notes: string[], values: Record<string, string[]>): FieldDef[] {
  const keys: string[] = [];
  for (const o of objects) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
  const out: FieldDef[] = [];
  for (const k of keys.slice(0, 64)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!isUsableKey(k)) {
      notes.push(`clé « ${k.slice(0, 40)} » ignorée (point, caractère invisible ou clé interdite) : réécrite telle quelle`);
      continue;
    }
    const f = inferJsonField(k, objects.map((o) => o[k]), path, depth, notes, values);
    if (f) out.push(f);
  }
  if (keys.length > 64) notes.push(`${keys.length - 64} clé(s) au-delà de 64 à ce niveau, laissées telles quelles`);
  return out;
}

function inferJson(text: string): InferResult {
  const notes: string[] = [];
  const values: Record<string, string[]> = {};
  const scan = scanJson(text);
  if (!scan.ok) throw new Error(scan.code === 'forbidden_key' ? `clé interdite « ${scan.detail} »` : (scan.detail ?? 'JSON invalide'));
  const doc = JSON.parse(text.replace(/^﻿/, '')) as unknown;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('la racine du fichier doit être un objet { … }');
  const fields = inferJsonObject([doc as Record<string, unknown>], '', 0, notes, values);
  return { format: { type: 'json' }, fields, notes, values };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const TRUE_WORDS = ['true', 'oui', 'yes', 'vrai', 'x', '1'];
const FALSE_WORDS = ['false', 'non', 'no', 'faux', '', '0'];

function inferCsv(text: string, delimiter?: ',' | ';' | '\t'): InferResult {
  const notes: string[] = [];
  const values: Record<string, string[]> = {};
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const d = delimiter ?? detectDelimiter(firstLine);
  const rows = parseCsv(text, d);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const fields: FieldDef[] = [];
  const used = new Set<string>();
  header.forEach((rawKey, col) => {
    const key = rawKey.trim();
    if (!key) return;
    if (!isUsableKey(key) || used.has(key)) {
      notes.push(`colonne « ${key.slice(0, 40)} » ignorée (vide, en double, avec un point ou interdite) : réécrite telle quelle`);
      return;
    }
    used.add(key);
    const vals = body.map((r) => (r[col] ?? '').trim());
    const filled = vals.filter((v) => v !== '');
    const label = humanize(key);
    filled.forEach((v) => record(values, key, v));
    const num = (v: string) => (d === ';' ? /^-?\d+(?:[.,]\d+)?$/.test(v) : /^-?\d+(?:\.\d+)?$/.test(v));
    if (filled.length && filled.every(num)) {
      const hasComma = filled.some((v) => v.includes(','));
      const decimals = Math.max(0, ...filled.map((v) => (v.split(/[.,]/)[1] ?? '').length));
      fields.push({ key, type: 'number', label, ...(decimals > 0 ? { decimals: Math.min(decimals, 6) } : {}), ...(hasComma && d !== ';' ? { decimal: ',' } : {}) });
      return;
    }
    const lower = vals.map((v) => v.toLowerCase());
    if (filled.length && lower.every((v) => TRUE_WORDS.includes(v) || FALSE_WORDS.includes(v)) && new Set(lower).size <= 2 && lower.some((v) => v !== '' && v !== '0' && v !== '1')) {
      const t = lower.find((v) => TRUE_WORDS.includes(v) && v !== '') ?? 'true';
      const f = lower.find((v) => FALSE_WORDS.includes(v)) ?? (t === 'oui' ? 'non' : t === 'x' ? '' : 'false');
      const original = (w: string) => vals.find((v) => v.toLowerCase() === w) ?? w;
      fields.push({ key, type: 'boolean', label, ...(t !== 'true' || f !== 'false' ? { trueValue: original(t), falseValue: original(f) } : {}) });
      return;
    }
    fields.push({ key, type: stringType(filled), label });
  });
  return { format: { type: 'csv', ...(d !== ',' ? { delimiter: d } : {}) }, fields, notes, values };
}

// ── Lignes et clé : valeur ──────────────────────────────────────────────────

function inferLines(text: string): InferResult {
  const items = text.split(/\r?\n/).filter((l) => LINE_ITEM_RE.test(l)).length;
  return {
    format: { type: 'lines' },
    fields: [{ key: 'text', type: 'text', label: { fr: 'Élément', en: 'Item' } }],
    notes: items ? [] : ['aucune ligne « [ ] … » ou « [x] … » dans l’exemple : elles apparaîtront dès qu’on en ajoute'],
    values: {},
  };
}

function inferKeyValue(text: string, separator?: ':' | '=', mode?: 'fields' | 'entries'): InferResult {
  const notes: string[] = [];
  const values: Record<string, string[]> = {};
  const sep = separator ?? detectKeyValueSeparator(text);
  const pairs = parseKeyValue(text, sep);
  const keys = [...new Set(pairs.map((p) => p.key))];
  const duplicates = pairs.length - keys.length;
  const asEntries = mode === 'entries' || (mode === undefined && (keys.length > 40 || duplicates > 2));
  if (asEntries) {
    const allUrls = pairs.length > 0 && pairs.every((p) => URL_RE.test(p.value));
    return {
      format: { type: 'keyvalue', ...(sep !== ':' ? { separator: sep } : {}), mode: 'entries' },
      fields: [
        { key: 'key', type: 'text', label: { fr: 'Terme', en: 'Term' } },
        { key: 'value', type: allUrls ? 'url' : 'text', label: { fr: 'Définition', en: 'Definition' } },
      ],
      notes: [`${pairs.length} paires : présentées comme une liste d’entrées (mode « entries »)`],
      values,
    };
  }
  const fields: FieldDef[] = [];
  for (const k of keys.slice(0, 64)) {
    if (!isUsableKey(k)) {
      notes.push(`clé « ${k.slice(0, 40)} » ignorée (point, caractère invisible ou interdite) : réécrite telle quelle`);
      continue;
    }
    const vals = pairs.filter((p) => p.key === k).map((p) => p.value);
    vals.forEach((v) => record(values, k, v));
    const label = humanize(k);
    if (vals.every((v) => v !== '' && /^-?\d+(?:[.,]\d+)?$/.test(v))) fields.push({ key: k, type: 'number', label });
    else if (vals.every((v) => ['true', 'false', 'oui', 'non', 'yes', 'no'].includes(v.toLowerCase()))) fields.push({ key: k, type: 'boolean', label, ...(vals.some((v) => !['true', 'false'].includes(v.toLowerCase())) ? { trueValue: 'oui', falseValue: 'non' } : {}) });
    else {
      const t = stringType(vals);
      fields.push({ key: k, type: t === 'longtext' ? 'text' : t, label });
    }
  }
  if (duplicates > 0) notes.push(`${duplicates} clé(s) en double : seule la première occurrence est éditée, les autres restent telles quelles`);
  return { format: { type: 'keyvalue', ...(sep !== ':' ? { separator: sep } : {}) }, fields, notes, values };
}

// ── Le format ───────────────────────────────────────────────────────────────

export function detectFormat(text: string, fileName = ''): FormatDef['type'] {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  const t = text.replace(/^﻿/, '').trim();
  if (t.startsWith('{')) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return 'json';
    } catch {
      /* pas du JSON */
    }
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return 'json';
  const items = lines.filter((l) => LINE_ITEM_RE.test(l)).length;
  if (items > 0 && items >= lines.length / 2) return 'lines';
  const d = detectDelimiter(lines[0]);
  if (lines.length >= 2) {
    const count = (l: string) => parseCsv(l, d)[0]?.length ?? 0;
    const n = count(lines[0]);
    if (n >= 2 && lines.slice(1, 6).every((l) => count(l) === n)) return 'csv';
  }
  const kv = lines.filter((l) => /^\s*[^\s:=#;][^:=]*[:=]/.test(l)).length;
  if (kv >= lines.length / 2) return 'keyvalue';
  return 'lines';
}

/** Les champs d'un exemple, pour un format donné (ou deviné). */
export function inferFields(text: string, format?: FormatDef, fileName = ''): InferResult {
  if (new TextEncoder().encode(text).byteLength > MAX_SAMPLE_BYTES) throw new Error('exemple de plus de 8 Mio : le moteur ne l’ouvrirait pas');
  const type = format?.type ?? detectFormat(text, fileName);
  switch (type) {
    case 'json':
      return inferJson(text);
    case 'csv':
      return inferCsv(text, (format as { delimiter?: ',' | ';' | '\t' } | undefined)?.delimiter);
    case 'lines':
      return inferLines(text);
    case 'keyvalue':
      return inferKeyValue(text, (format as { separator?: ':' | '=' } | undefined)?.separator, (format as { mode?: 'fields' | 'entries' } | undefined)?.mode);
  }
}
