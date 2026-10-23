/**
 * lines — une liste à cocher, une ligne par élément : `[x] fait`, `[ ] à faire`.
 *
 * Accepte une puce devant (`- [ ] lait`, `* [x] pain`) et une indentation ; les
 * reprend telles quelles. Toute ligne qui n'a pas cette forme (titre, note,
 * ligne vide) est gardée à sa place, mot pour mot. Un élément ajouté prend la
 * forme du dernier élément du fichier.
 */

import type { DocFormatContext, ListAccess, Scope } from '../model';
import { detectEol, encodeText } from '../safe';
import type { FieldDef, NocodeConfig } from '../types';
import { rootFields } from '../schema';
import type { DocumentResult } from './document';

// Les coches ✓ et ✔ passent par une CHAÎNE : esbuild rend littéraux les
// échappements d'une expression régulière, et le bundle doit rester en ASCII.
const ITEM_RE = new RegExp('^(\\s*(?:[-*+]\\s+)?)\\[([ xX✓✔])\\](?: (.*)|$)');

interface LineEntry {
  kind: 'item' | 'other';
  raw: string;
  prefix: string;
  mark: string;
  done: boolean;
  text: string;
  dirty: boolean;
}

function parseLine(raw: string): LineEntry {
  const m = ITEM_RE.exec(raw);
  if (!m) return { kind: 'other', raw, prefix: '', mark: ' ', done: false, text: '', dirty: false };
  return {
    kind: 'item',
    raw,
    prefix: m[1],
    mark: m[2],
    done: m[2] !== ' ',
    text: m[3] ?? '',
    dirty: false,
  };
}

function lineOf(e: LineEntry): string {
  if (!e.dirty) return e.raw;
  const mark = e.done ? (e.mark !== ' ' ? e.mark : 'x') : ' ';
  return `${e.prefix}[${mark}]${e.text === '' ? '' : ` ${e.text}`}`;
}

class LineItemScope implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly entry: LineEntry
  ) {}

  /** Le texte que `writeValue` écrit pour « fait » — la ligne, elle, ne range qu'un booléen. */
  private truth(): [string, string] {
    const def = this.fields.find((f) => f.key === 'done');
    return [def?.trueValue ?? 'true', def?.falseValue ?? 'false'];
  }

  get(key: string): unknown {
    if (key === 'done') return this.entry.done ? this.truth()[0] : this.truth()[1];
    if (key === 'text') return this.entry.text;
    return undefined;
  }

  set(key: string, raw: unknown): void {
    const s = typeof raw === 'string' ? raw : '';
    if (key === 'done') this.entry.done = s === this.truth()[0];
    else if (key === 'text') this.entry.text = s.replace(/[\r\n]+/g, ' ');
    else return;
    this.entry.dirty = true;
  }

  list(): ListAccess {
    throw new Error('lines_no_list');
  }

  object(): Scope {
    throw new Error('lines_no_object');
  }
}

class LineItems implements ListAccess {
  constructor(
    readonly def: FieldDef,
    private readonly entries: LineEntry[]
  ) {}

  private items(): LineEntry[] {
    return this.entries.filter((e) => e.kind === 'item');
  }

  length(): number {
    return this.items().length;
  }

  item(i: number): Scope | null {
    const e = this.items()[i];
    return e ? new LineItemScope(this.def.fields ?? [], e) : null;
  }

  text(i: number): string {
    return this.items()[i]?.text ?? '';
  }

  setText(i: number, text: string): void {
    const e = this.items()[i];
    if (!e) return;
    e.text = text.replace(/[\r\n]+/g, ' ');
    e.dirty = true;
  }

  add(text?: string): number {
    const items = this.items();
    const dernier = items[items.length - 1];
    const entry: LineEntry = {
      kind: 'item',
      raw: '',
      prefix: dernier?.prefix ?? '',
      mark: ' ',
      done: false,
      text: (text ?? '').replace(/[\r\n]+/g, ' '),
      dirty: true,
    };
    // Juste après le dernier élément : un titre ou une note en fin de fichier restent en fin.
    const at = dernier ? this.entries.indexOf(dernier) + 1 : this.entries.length;
    this.entries.splice(at, 0, entry);
    return this.length() - 1;
  }

  remove(i: number): void {
    const e = this.items()[i];
    if (e) this.entries.splice(this.entries.indexOf(e), 1);
  }

  move(from: number, to: number): void {
    const items = this.items();
    const a = items[from];
    const b = items[to];
    if (!a || !b || a === b) return;
    const ia = this.entries.indexOf(a);
    const ib = this.entries.indexOf(b);
    this.entries[ia] = b;
    this.entries[ib] = a;
  }
}

class LinesRoot implements Scope {
  readonly fields: readonly FieldDef[];
  constructor(
    config: NocodeConfig,
    private readonly entries: LineEntry[]
  ) {
    this.fields = rootFields(config);
  }

  get(): unknown {
    return undefined;
  }

  set(): void {}

  list(): ListAccess {
    return new LineItems(this.fields[0], this.entries);
  }

  object(): Scope {
    throw new Error('lines_no_object');
  }
}

export function openLines(text: string, bom: boolean, config: NocodeConfig): DocumentResult {
  const ctx: DocFormatContext = { textual: true };
  const isNew = text.trim() === '';
  const eol = isNew ? '\n' : detectEol(text);
  const finalEol = isNew ? true : /\r?\n$/.test(text);
  const body = isNew ? '' : text.replace(/\r?\n$/, '');
  const entries: LineEntry[] = isNew ? [] : body.split(/\r?\n/).map(parseLine);
  return {
    ok: true,
    doc: {
      root: new LinesRoot(config, entries),
      ctx,
      isNew,
      readOnlyReasons: [],
      serialize() {
        const out = entries.map(lineOf).join(eol);
        return encodeText(out + (finalEol && entries.length > 0 ? eol : ''), bom);
      },
    },
  };
}
