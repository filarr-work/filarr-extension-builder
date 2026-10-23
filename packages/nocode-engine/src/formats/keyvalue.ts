/**
 * keyvalue — une valeur par ligne : `clé: valeur` (ou `clé = valeur`).
 *
 * Deux lectures :
 *  · `fields` (défaut) : les clés sont les champs déclarés ; la première
 *    occurrence d'une clé est la sienne, les autres lignes (clés inconnues,
 *    doublons, commentaires `#` `;` `//`, lignes vides) sont gardées mot pour mot ;
 *  · `entries` : TOUTES les paires forment une liste qu'on édite (un glossaire,
 *    un carnet d'adresses) ; ajout et retrait de lignes.
 *
 * Une ligne touchée garde son « préfixe » d'origine (la clé, le séparateur et
 * les espaces qui suivent) ; seule la valeur change. Une valeur tient sur une
 * ligne : un retour à la ligne saisi devient une espace.
 */

import type { DocFormatContext, ListAccess, Scope } from '../model';
import { detectEol, encodeText, isForbiddenKey } from '../safe';
import { rootFields } from '../schema';
import type { FieldDef, NocodeConfig } from '../types';
import type { DocumentResult } from './document';

interface KvLine {
  kind: 'pair' | 'other';
  raw: string;
  key: string;
  /** Ce qui précède la valeur, tel quel (`nom:  `). */
  prefix: string;
  value: string;
  dirty: boolean;
  /** Une clé renommée (mode `entries`) : le préfixe est reconstruit. */
  renamed: boolean;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

function parseKvLine(raw: string, sep: string): KvLine {
  const other: KvLine = { kind: 'other', raw, key: '', prefix: '', value: '', dirty: false, renamed: false };
  const t = raw.trim();
  if (t === '' || t.startsWith('#') || t.startsWith(';') || t.startsWith('//')) return other;
  const i = raw.indexOf(sep);
  if (i <= 0) return other;
  const key = raw.slice(0, i).trim();
  if (key === '') return other;
  let j = i + 1;
  while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t')) j++;
  return { kind: 'pair', raw, key, prefix: raw.slice(0, j), value: raw.slice(j).trimEnd(), dirty: false, renamed: false };
}

function lineOf(l: KvLine, sep: string): string {
  if (!l.dirty) return l.raw;
  if (l.renamed) return `${l.key}${sep === ':' ? ': ' : ' = '}${l.value}`;
  return `${l.prefix}${l.value}`;
}

function newPair(key: string, value: string, sep: string): KvLine {
  const prefix = `${key}${sep === ':' ? ': ' : ' = '}`;
  return { kind: 'pair', raw: '', key, prefix, value: oneLine(value), dirty: true, renamed: false };
}

/** Mode `fields` : la racine, dont les clés sont les champs déclarés. */
class KvFieldsScope implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly lines: KvLine[],
    private readonly sep: string
  ) {}

  private find(key: string): KvLine | undefined {
    return this.lines.find((l) => l.kind === 'pair' && l.key === key);
  }

  get(key: string): unknown {
    return this.find(key)?.value;
  }

  set(key: string, raw: unknown): void {
    const v = oneLine(typeof raw === 'string' ? raw : '');
    const line = this.find(key);
    if (line) {
      if (line.value === v) return;
      line.value = v;
      line.dirty = true;
      return;
    }
    this.lines.push(newPair(key, v, this.sep));
  }

  list(): ListAccess {
    throw new Error('keyvalue_no_list');
  }

  object(): Scope {
    throw new Error('keyvalue_no_object');
  }
}

/** Mode `entries` : une paire, vue comme un élément { key, value }. */
class KvEntryScope implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly line: KvLine,
    private readonly sep: string
  ) {}

  get(key: string): unknown {
    if (key === 'key') return this.line.key;
    if (key === 'value') return this.line.value;
    return undefined;
  }

  set(key: string, raw: unknown): void {
    const v = oneLine(typeof raw === 'string' ? raw : '');
    if (key === 'value') {
      this.line.value = v;
      this.line.dirty = true;
    } else if (key === 'key') {
      // Une clé ne porte ni le séparateur, ni une clé interdite : on n'écrit pas ce
      // qu'on ne saurait pas relire.
      const k = v.split(this.sep).join(' ').trim();
      if (k === '' || isForbiddenKey(k) || /^(#|;|\/\/)/.test(k)) return;
      this.line.key = k;
      this.line.dirty = true;
      this.line.renamed = true;
    }
  }

  list(): ListAccess {
    throw new Error('keyvalue_no_list');
  }

  object(): Scope {
    throw new Error('keyvalue_no_object');
  }
}

class KvEntries implements ListAccess {
  constructor(
    readonly def: FieldDef,
    private readonly lines: KvLine[],
    private readonly sep: string
  ) {}

  private pairs(): KvLine[] {
    return this.lines.filter((l) => l.kind === 'pair');
  }

  length(): number {
    return this.pairs().length;
  }

  item(i: number): Scope | null {
    const l = this.pairs()[i];
    return l ? new KvEntryScope(this.def.fields ?? [], l, this.sep) : null;
  }

  text(): string {
    return '';
  }

  setText(): void {}

  /** `text` : la clé de la nouvelle paire (l'interface passe un libellé dans la langue). */
  add(text?: string): number {
    const pairs = this.pairs();
    let key = oneLine(text ?? '').split(this.sep).join(' ').trim();
    if (key === '' || isForbiddenKey(key) || /^(#|;|\/\/)/.test(key)) key = `${pairs.length + 1}`;
    const line = newPair(key, '', this.sep);
    line.renamed = true;
    const dernier = pairs[pairs.length - 1];
    const at = dernier ? this.lines.indexOf(dernier) + 1 : this.lines.length;
    this.lines.splice(at, 0, line);
    return this.length() - 1;
  }

  remove(i: number): void {
    const l = this.pairs()[i];
    if (l) this.lines.splice(this.lines.indexOf(l), 1);
  }

  move(from: number, to: number): void {
    const pairs = this.pairs();
    const a = pairs[from];
    const b = pairs[to];
    if (!a || !b || a === b) return;
    const ia = this.lines.indexOf(a);
    const ib = this.lines.indexOf(b);
    this.lines[ia] = b;
    this.lines[ib] = a;
  }
}

class KvEntriesRoot implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly lines: KvLine[],
    private readonly sep: string
  ) {}

  get(): unknown {
    return undefined;
  }

  set(): void {}

  list(): ListAccess {
    return new KvEntries(this.fields[0], this.lines, this.sep);
  }

  object(): Scope {
    throw new Error('keyvalue_no_object');
  }
}

export function openKeyValue(text: string, bom: boolean, config: NocodeConfig): DocumentResult {
  const format = config.format.type === 'keyvalue' ? config.format : { type: 'keyvalue' as const };
  const sep = format.separator ?? ':';
  const entries = format.mode === 'entries';
  const ctx: DocFormatContext = { textual: true };
  const isNew = text.trim() === '';
  const eol = isNew ? '\n' : detectEol(text);
  const finalEol = isNew ? true : /\r?\n$/.test(text);
  const lines: KvLine[] = isNew ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/).map((l) => parseKvLine(l, sep));
  const interdite = lines.find((l) => l.kind === 'pair' && isForbiddenKey(l.key));
  if (interdite) return { ok: false, code: 'forbidden_key', detail: interdite.key };

  const root: Scope = entries
    ? new KvEntriesRoot(rootFields(config), lines, sep)
    : new KvFieldsScope(config.fields, lines, sep);

  if (isNew && !entries) {
    // Un document neuf porte les valeurs par défaut DÉCLARÉES, et seulement elles.
    for (const f of config.fields) {
      if (f.default === undefined) continue;
      const v = f.type === 'boolean' ? (f.default ? (f.trueValue ?? 'true') : (f.falseValue ?? 'false')) : Array.isArray(f.default) ? (f.default as string[]).join(f.separator === undefined || f.separator === ',' ? ', ' : f.separator) : String(f.default);
      lines.push(newPair(f.key, v, sep));
    }
  }

  return {
    ok: true,
    doc: {
      root,
      ctx,
      isNew,
      readOnlyReasons: [],
      serialize() {
        const out = lines.map((l) => lineOf(l, sep)).join(eol);
        return encodeText(out + (finalEol && lines.length > 0 ? eol : ''), bom);
      },
    },
  };
}
