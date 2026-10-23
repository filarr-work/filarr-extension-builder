/**
 * compute — les valeurs CALCULÉES : totaux, moyennes, comptes, progressions.
 *
 * Aucune expression libre : une opération d'une liste fermée, appliquée à des
 * champs déclarés. Une formule écrite par l'auteur serait du code — et le
 * moteur n'en évalue aucun.
 */

import { readValue, resolveScope, type DocFormatContext, type Scope } from './model';
import { resolveField } from './schema';
import type { ComputeDef, FieldDef } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** La valeur typée d'un chemin `a.b` du niveau. */
function typed(scope: Scope, path: string, ctx: DocFormatContext): unknown {
  const r = resolveScope(scope, path);
  return r ? readValue(r.def, r.scope.get(r.key), ctx) : undefined;
}

/** Comme la validation : la liste est visée, ou implicite quand `of` n'est pas un champ du niveau. */
function listModeOf(scope: Scope, def: ComputeDef, implicit: string | null): string | null {
  if (def.field !== undefined) return def.field;
  if (implicit === null) return null;
  const of = def.of === undefined ? [] : Array.isArray(def.of) ? def.of : [def.of];
  if (of.length === 0 || of.every((x) => !resolveField(scope.fields, x))) return implicit;
  return null;
}

function firstOfType(fields: readonly FieldDef[] | undefined, types: string[]): string | undefined {
  return fields?.find((f) => types.includes(f.type))?.key;
}

function reduce(op: ComputeDef['op'], values: number[]): number | null {
  if (op === 'sum' || op === 'sumProduct') return values.reduce((a, b) => a + b, 0);
  if (values.length === 0) return null;
  if (op === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  return values.length;
}

export function computeValue(
  scope: Scope,
  def: ComputeDef,
  implicit: string | null,
  ctx: DocFormatContext
): number | null {
  const of = def.of === undefined ? [] : Array.isArray(def.of) ? def.of : [def.of];
  const listKey = listModeOf(scope, def, implicit);
  if (listKey !== null) {
    const list = scope.list(listKey);
    const itemFields = list.def.fields;
    const n = list.length();
    if (def.op === 'count') return n;
    const values: number[] = [];
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const item = list.item(i);
      if (!item) continue;
      if (def.op === 'countChecked') {
        const key = of[0] ?? firstOfType(itemFields, ['boolean']);
        if (key && typed(item, key, ctx) === true) checked++;
        continue;
      }
      if (def.op === 'sumProduct') {
        const nums = of.map((k) => typed(item, k, ctx));
        if (nums.every(isNum)) values.push((nums as number[]).reduce((a, b) => a * b, 1));
        continue;
      }
      const key = of[0] ?? firstOfType(itemFields, ['number', 'rating']);
      const v = key ? typed(item, key, ctx) : undefined;
      if (isNum(v)) values.push(v);
    }
    return def.op === 'countChecked' ? checked : reduce(def.op, values);
  }
  // Au niveau courant : les champs nommés par `of`.
  if (def.op === 'countChecked') return of.filter((k) => typed(scope, k, ctx) === true).length;
  if (def.op === 'count') {
    return of.filter((k) => {
      const v = typed(scope, k, ctx);
      return v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0);
    }).length;
  }
  const nums = of.map((k) => typed(scope, k, ctx)).filter(isNum);
  if (def.op === 'sumProduct') return nums.length === of.length ? nums.reduce((a, b) => a * b, 1) : null;
  return reduce(def.op, nums);
}

/** Une progression : `value` sur `max`. `null` quand elle n'a pas de sens (liste vide). */
export function progressOf(
  scope: Scope,
  block: { field?: string; check?: string; max?: number; maxField?: string },
  implicit: string | null,
  ctx: DocFormatContext
): { value: number; max: number } | null {
  if (block.max !== undefined || block.maxField !== undefined) {
    const v = block.field ? typed(scope, block.field, ctx) : null;
    const max = block.maxField !== undefined ? typed(scope, block.maxField, ctx) : block.max;
    if (!isNum(max) || max <= 0) return null;
    return { value: isNum(v) ? v : 0, max };
  }
  const key = block.field ?? implicit;
  if (!key) return null;
  const list = scope.list(key);
  const check = block.check ?? firstOfType(list.def.fields, ['boolean']);
  const n = list.length();
  let done = 0;
  for (let i = 0; i < n; i++) {
    const item = list.item(i);
    if (item && check && typed(item, check, ctx) === true) done++;
  }
  return { value: done, max: n };
}
