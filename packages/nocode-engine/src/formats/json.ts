/**
 * json — un document JSON dont la racine est un objet.
 *
 * On garde l'objet tel que `JSON.parse` l'a rendu et on n'y change que les clés
 * touchées : tout le reste (clés inconnues, valeurs d'un autre type que prévu,
 * éléments de liste mal formés) repart à l'identique. L'indentation, la fin de
 * ligne et les blancs autour de la racine sont relevés à l'ouverture et
 * réutilisés.
 *
 * Limite assumée : `JSON.stringify` réécrit les nombres sous leur forme courte
 * (`1.0` → `1`) et place en tête les clés qui ressemblent à des entiers. La
 * VALEUR est la même ; l'écriture peut différer. Un nombre qui perdrait des
 * chiffres, lui, ouvre le document en lecture seule (`scanJson`).
 */

import {
  defaultObject,
  structuredCopy,
  type DocFormatContext,
  type ListAccess,
  type Scope,
} from '../model';
import { detectEol, encodeText, hasOwn, isPlainObject, scanJson } from '../safe';
import type { FieldDef, NocodeConfig } from '../types';
import type { DocumentResult, ReadOnlyReason } from './document';

type Obj = Record<string, unknown>;

function own(o: Obj | null, k: string): unknown {
  return o && hasOwn(o, k) ? o[k] : undefined;
}

class JsonList implements ListAccess {
  constructor(
    readonly def: FieldDef,
    private readonly ctx: DocFormatContext,
    private readonly read: () => unknown[] | null,
    private readonly ensure: () => unknown[]
  ) {}

  length(): number {
    return this.read()?.length ?? 0;
  }

  item(i: number): Scope | null {
    const v = this.read()?.[i];
    if (!isPlainObject(v)) return null;
    // Par RÉFÉRENCE à l'objet, pas par indice : l'élément reste le bon après un déplacement.
    return new JsonScope(this.def.fields ?? [], this.ctx, () => v, () => v);
  }

  text(i: number): string {
    const v = this.read()?.[i];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  setText(i: number, text: string): void {
    const arr = this.ensure();
    if (i >= 0 && i < arr.length) arr[i] = text;
  }

  add(text?: string): number {
    const arr = this.ensure();
    if (this.def.type === 'textlist') arr.push(text ?? '');
    else arr.push(defaultObject(this.def.fields ?? [], this.ctx));
    return arr.length - 1;
  }

  remove(i: number): void {
    const arr = this.ensure();
    if (i >= 0 && i < arr.length) arr.splice(i, 1);
  }

  move(from: number, to: number): void {
    const arr = this.ensure();
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
    const [v] = arr.splice(from, 1);
    arr.splice(to, 0, v);
  }
}

export class JsonScope implements Scope {
  constructor(
    readonly fields: readonly FieldDef[],
    private readonly ctx: DocFormatContext,
    private readonly read: () => Obj | null,
    private readonly ensure: () => Obj
  ) {}

  private def(key: string): FieldDef {
    return this.fields.find((f) => f.key === key) ?? { key, type: 'text' };
  }

  get(key: string): unknown {
    return own(this.read(), key);
  }

  set(key: string, raw: unknown): void {
    // Les clés viennent de la configuration, validée : jamais `__proto__` ni ses cousines.
    this.ensure()[key] = raw;
  }

  list(key: string): ListAccess {
    return new JsonList(
      this.def(key),
      this.ctx,
      () => {
        const v = own(this.read(), key);
        return Array.isArray(v) ? v : null;
      },
      () => {
        const o = this.ensure();
        const v = own(o, key);
        if (Array.isArray(v)) return v;
        const neuf: unknown[] = [];
        o[key] = neuf;
        return neuf;
      }
    );
  }

  object(key: string): Scope {
    const def = this.def(key);
    return new JsonScope(
      def.fields ?? [],
      this.ctx,
      () => {
        const v = own(this.read(), key);
        return isPlainObject(v) ? v : null;
      },
      () => {
        const o = this.ensure();
        const v = own(o, key);
        if (isPlainObject(v)) return v;
        const neuf: Obj = {};
        o[key] = neuf;
        return neuf;
      }
    );
  }
}

/** L'indentation d'un texte JSON : celle de la première ligne indentée, sinon compacte. */
function detectIndent(text: string): string | number {
  const m = /\n([ \t]+)\S/.exec(text);
  if (!m) return 0;
  return m[1].startsWith('\t') ? '\t' : m[1].length;
}

export function openJson(text: string, bom: boolean, config: NocodeConfig): DocumentResult {
  const ctx: DocFormatContext = { textual: false };
  const isNew = text.trim() === '';
  const reasons: ReadOnlyReason[] = [];
  let root: Obj;
  if (isNew) {
    root = defaultObject(config.fields, ctx);
  } else {
    const scan = scanJson(text);
    if (!scan.ok) return { ok: false, code: scan.code ?? 'invalid_json', detail: scan.detail };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, code: 'invalid_json', detail: e instanceof Error ? e.message : undefined };
    }
    if (!isPlainObject(parsed)) return { ok: false, code: 'not_object' };
    root = parsed;
    if (scan.duplicateKey !== undefined) reasons.push({ code: 'duplicate_key', detail: scan.duplicateKey });
    if (scan.imprecise !== undefined) reasons.push({ code: 'imprecise_number', detail: scan.imprecise });
  }

  const format = config.format.type === 'json' ? config.format : { type: 'json' as const };
  const indent: string | number = isNew
    ? format.indent === 'tab'
      ? '\t'
      : (format.indent ?? 2)
    : detectIndent(text);
  const eol = isNew ? '\n' : detectEol(text);
  const lead = isNew ? '' : text.slice(0, text.length - text.trimStart().length);
  const tail = isNew ? '\n' : text.slice(text.trimEnd().length);

  const scope = new JsonScope(config.fields, ctx, () => root, () => root);
  return {
    ok: true,
    doc: {
      root: scope,
      ctx,
      isNew,
      readOnlyReasons: reasons,
      serialize() {
        let body = JSON.stringify(root, null, indent);
        if (eol === '\r\n') body = body.replace(/\n/g, '\r\n');
        return encodeText(lead + body + tail, bom);
      },
    },
  };
}

/** Pour les exports : l'objet racine tel qu'il est maintenant (copie). */
export function jsonSnapshot(scope: Scope): unknown {
  const out: Obj = {};
  for (const f of scope.fields) {
    const v = scope.get(f.key);
    if (v !== undefined) out[f.key] = structuredCopy(v);
  }
  return out;
}
