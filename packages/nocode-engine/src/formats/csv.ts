/**
 * csv — un tableau : une ligne d'en-tête, puis une ligne par enregistrement.
 *
 * La conservation se fait à la LIGNE : une ligne qu'on n'a pas touchée est
 * réécrite octet pour octet (guillemets, espaces, fins de ligne compris) ; une
 * ligne touchée est réécrite cellule par cellule, et seule la cellule éditée a
 * changé de valeur. Les colonnes que la configuration ne déclare pas sont
 * gardées à leur place. Les lignes vides sont gardées aussi.
 *
 * Une colonne déclarée mais absente du fichier est ajoutée à la première
 * écriture qui la remplit — l'en-tête et toutes les lignes sont alors réécrits
 * (un CSV garde le même nombre de cellules partout).
 */

import { defaultObject, type DocFormatContext, type ListAccess, type Scope } from '../model';
import { detectEol, encodeText, isForbiddenKey } from '../safe';
import type { FieldDef, NocodeConfig } from '../types';
import type { DocumentResult } from './document';

interface CsvRecord {
  cells: string[];
  /** Le texte d'origine, sans sa fin de ligne ; `null` pour une ligne neuve. */
  raw: string | null;
  dirty: boolean;
  blank: boolean;
}

/** Découpe un texte CSV en enregistrements (RFC 4180, guillemets doublés). */
export function parseCsvRecords(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let start = 0;
  let i = 0;
  const n = text.length;
  const d = delimiter.charCodeAt(0);
  const finRecord = (end: number) => {
    cells.push(cell);
    const raw = text.slice(start, end);
    records.push({ cells, raw, dirty: false, blank: raw.trim() === '' && cells.length === 1 });
    cells = [];
    cell = '';
  };
  while (i < n) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 0x22) {
        if (text.charCodeAt(i + 1) === 0x22) {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += text[i];
      i++;
      continue;
    }
    if (c === 0x22 && cell === '') {
      quoted = true;
      i++;
      continue;
    }
    if (c === d) {
      cells.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === 0x0d || c === 0x0a) {
      finRecord(i);
      i += c === 0x0d && text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      start = i;
      continue;
    }
    cell += text[i];
    i++;
  }
  if (start < n || cells.length > 0 || cell !== '') finRecord(n);
  return records;
}

function quoteCell(v: string, delimiter: string): string {
  if (v === '' || !(v.includes(delimiter) || /["\r\n]/.test(v) || v.trim() !== v)) return v;
  return `"${v.replace(/"/g, '""')}"`;
}

class CsvTable {
  header: string[] = [];
  headerRaw: string | null = null;
  headerDirty = false;
  /** Les lignes vides avant l'en-tête. */
  before: CsvRecord[] = [];
  records: CsvRecord[] = [];

  column(key: string): number {
    const exact = this.header.indexOf(key);
    return exact >= 0 ? exact : this.header.findIndex((h) => h.trim() === key);
  }

  /** L'indice de la colonne, ajoutée si besoin (en-tête et lignes réécrits). */
  ensureColumn(key: string): number {
    let i = this.column(key);
    if (i >= 0) return i;
    this.header.push(key);
    this.headerDirty = true;
    i = this.header.length - 1;
    for (const r of this.records) {
      if (!r.blank) r.dirty = true;
    }
    return i;
  }
}

class CsvRowScope implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly table: CsvTable,
    readonly record: CsvRecord
  ) {}

  get(key: string): unknown {
    const i = this.table.column(key);
    return i >= 0 ? (this.record.cells[i] ?? '') : undefined;
  }

  set(key: string, raw: unknown): void {
    const i = this.table.ensureColumn(key);
    while (this.record.cells.length <= i) this.record.cells.push('');
    this.record.cells[i] = typeof raw === 'string' ? raw : '';
    this.record.dirty = true;
  }

  list(): ListAccess {
    throw new Error('csv_no_list');
  }

  object(): Scope {
    throw new Error('csv_no_object');
  }
}

class CsvRows implements ListAccess {
  constructor(
    readonly def: FieldDef,
    private readonly table: CsvTable,
    private readonly ctx: DocFormatContext
  ) {}

  private rows(): CsvRecord[] {
    return this.table.records.filter((r) => !r.blank);
  }

  length(): number {
    return this.rows().length;
  }

  item(i: number): Scope | null {
    const r = this.rows()[i];
    return r ? new CsvRowScope(this.def.fields ?? [], this.table, r) : null;
  }

  text(): string {
    return '';
  }

  setText(): void {}

  add(): number {
    const fields = this.def.fields ?? [];
    // Un tableau vide prend pour en-tête les colonnes déclarées, dans leur ordre.
    if (this.table.header.length === 0) {
      this.table.header = fields.map((f) => f.key);
      this.table.headerDirty = true;
    }
    const valeurs = defaultObject(fields, this.ctx);
    const record: CsvRecord = { cells: this.table.header.map(() => ''), raw: null, dirty: true, blank: false };
    this.table.records.push(record);
    const scope = new CsvRowScope(fields, this.table, record);
    for (const f of fields) {
      const v = valeurs[f.key];
      if (typeof v === 'string' && v !== '') scope.set(f.key, v);
    }
    return this.length() - 1;
  }

  remove(i: number): void {
    const r = this.rows()[i];
    if (!r) return;
    this.table.records.splice(this.table.records.indexOf(r), 1);
  }

  move(from: number, to: number): void {
    const rows = this.rows();
    const a = rows[from];
    const b = rows[to];
    if (!a || !b || a === b) return;
    const ia = this.table.records.indexOf(a);
    const ib = this.table.records.indexOf(b);
    this.table.records[ia] = b;
    this.table.records[ib] = a;
  }
}

class CsvRootScope implements Scope {
  readonly fields: readonly FieldDef[];
  private readonly rowsDef: FieldDef;
  constructor(
    columns: FieldDef[],
    private readonly table: CsvTable,
    private readonly ctx: DocFormatContext
  ) {
    this.rowsDef = { key: 'rows', type: 'list', fields: columns };
    this.fields = [this.rowsDef];
  }

  get(): unknown {
    return undefined;
  }

  set(): void {}

  list(): ListAccess {
    return new CsvRows(this.rowsDef, this.table, this.ctx);
  }

  object(): Scope {
    throw new Error('csv_no_object');
  }
}

export function openCsv(text: string, bom: boolean, config: NocodeConfig): DocumentResult {
  const delimiter = config.format.type === 'csv' ? (config.format.delimiter ?? ',') : ',';
  const ctx: DocFormatContext = { textual: true, decimal: delimiter === ';' ? ',' : '.' };
  const isNew = text.trim() === '';
  const table = new CsvTable();
  const eol = isNew ? '\n' : detectEol(text);
  const finalEol = isNew ? true : /\r?\n$/.test(text);
  if (!isNew) {
    const records = parseCsvRecords(text.replace(/\r?\n$/, ''), delimiter);
    const headerIndex = records.findIndex((r) => !r.blank);
    if (headerIndex >= 0) {
      const head = records[headerIndex];
      table.header = head.cells;
      table.headerRaw = head.raw;
      const interdite = head.cells.find((k) => isForbiddenKey(k.trim()));
      if (interdite !== undefined) return { ok: false, code: 'forbidden_key', detail: interdite };
      // Les lignes vides AVANT l'en-tête restent devant lui.
      table.before = records.slice(0, headerIndex);
      table.records = records.slice(headerIndex + 1);
    } else {
      table.before = records;
    }
  }

  const root = new CsvRootScope(config.fields, table, ctx);
  return {
    ok: true,
    doc: {
      root,
      ctx,
      isNew,
      readOnlyReasons: [],
      serialize() {
        const lignes: string[] = table.before.map((r) => r.raw ?? '');
        const header =
          table.headerDirty || table.headerRaw === null
            ? table.header.map((h) => quoteCell(h, delimiter)).join(delimiter)
            : table.headerRaw;
        if (table.header.length > 0) lignes.push(header);
        for (const r of table.records) {
          if (r.blank) {
            lignes.push(r.raw ?? '');
            continue;
          }
          if (!r.dirty && r.raw !== null) {
            lignes.push(r.raw);
            continue;
          }
          const cells = [...r.cells];
          while (cells.length < table.header.length) cells.push('');
          lignes.push(cells.map((c) => quoteCell(c, delimiter)).join(delimiter));
        }
        return encodeText(lignes.join(eol) + (finalEol && lignes.length > 0 ? eol : ''), bom);
      },
    },
  };
}
