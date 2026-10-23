/**
 * controls — un champ de saisie par type de valeur.
 *
 * Chaque contrôle lit la valeur TYPÉE, et n'écrit que par `rc.mutate` : c'est
 * là que la lecture seule est tenue, une fois pour toutes, par le moteur. Un
 * contrôle désactivé à l'écran est un confort ; le refus dans `mutate` est la
 * garantie.
 */

import { readValue, resolveScope, writeValue, type DocFormatContext, type Scope } from '../model';
import { formatNumberFor } from '../present';
import { localText, words, type Words } from '../text';
import type { FieldDef, Lang, NocodeConfig } from '../types';
import { el, link, safeHref, setCssVar } from './dom';

export interface RenderCtx {
  config: NocodeConfig;
  ctx: DocFormatContext;
  lang: Lang;
  t: Words;
  readOnly: boolean;
  /**
   * Toute écriture passe ici. `structural` : la vue est reconstruite (ajout,
   * retrait, déplacement). Rend `false` — et n'écrit rien — en lecture seule.
   */
  mutate(fn: () => void, structural?: boolean): boolean;
  /** Les valeurs calculées (totaux, barres, compteurs) à rafraîchir après chaque écriture. */
  refreshers: (() => void)[];
}

export function getTyped(rc: RenderCtx, scope: Scope, path: string): { def: FieldDef; value: unknown } | null {
  const r = resolveScope(scope, path);
  if (!r) return null;
  return { def: r.def, value: readValue(r.def, r.scope.get(r.key), rc.ctx) };
}

export function setTyped(rc: RenderCtx, scope: Scope, path: string, value: unknown): void {
  const r = resolveScope(scope, path);
  if (!r) return;
  r.scope.set(r.key, writeValue(r.def, value, rc.ctx));
}

const ph = (def: FieldDef, lang: Lang) => (def.placeholder ? localText(def.placeholder, lang) : undefined);

function textInput(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string, cls = 'nc-input'): HTMLInputElement {
  const type = def.type === 'url' ? 'url' : def.type === 'email' ? 'email' : 'text';
  const input = el('input', {
    class: cls,
    attrs: { type, placeholder: ph(def, rc.lang), 'aria-label': localText(def.label, rc.lang, def.key), 'data-nc-key': key, spellcheck: type === 'text' ? 'true' : 'false' },
  });
  input.value = typeof value === 'string' ? value : '';
  input.readOnly = rc.readOnly;
  input.addEventListener('input', () => rc.mutate(() => setTyped(rc, scope, path, input.value)));
  return input;
}

export function longTextArea(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string, rows = 4): HTMLTextAreaElement {
  const ta = el('textarea', {
    class: 'nc-textarea',
    attrs: { rows: String(rows), placeholder: ph(def, rc.lang), 'aria-label': localText(def.label, rc.lang, def.key), 'data-nc-key': key },
  });
  ta.value = typeof value === 'string' ? value : '';
  ta.readOnly = rc.readOnly;
  ta.addEventListener('input', () => rc.mutate(() => setTyped(rc, scope, path, ta.value)));
  return ta;
}

function clamp(def: FieldDef, n: number): number {
  let v = n;
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

/** Un nombre : saisie libre, et − / + si demandé. */
export function numberInput(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string, stepper: boolean): HTMLElement {
  const input = el('input', {
    class: 'nc-input nc-num',
    attrs: {
      type: 'number',
      inputmode: 'decimal',
      step: def.step !== undefined ? String(def.step) : 'any',
      min: def.min !== undefined ? String(def.min) : undefined,
      max: def.max !== undefined ? String(def.max) : undefined,
      placeholder: ph(def, rc.lang),
      'aria-label': localText(def.label, rc.lang, def.key),
      'data-nc-key': key,
    },
  });
  input.value = typeof value === 'number' ? String(value) : '';
  input.readOnly = rc.readOnly;
  input.addEventListener('input', () => {
    const t = input.value.trim();
    const n = t === '' ? null : Number(t);
    if (n !== null && !Number.isFinite(n)) return;
    rc.mutate(() => setTyped(rc, scope, path, n === null ? null : clamp(def, n)));
  });
  const unit = def.unit ? el('span', { class: 'nc-unit', text: localText(def.unit, rc.lang) }) : null;
  if (!stepper) return el('span', { class: 'nc-number' }, input, unit);
  const step = def.step ?? 1;
  const bump = (dir: 1 | -1) => () => {
    const cur = getTyped(rc, scope, path)?.value;
    const base = typeof cur === 'number' ? cur : (def.min ?? 0);
    // Arrondi au pas : 0,1 + 0,2 ne doit pas afficher 0,30000000000000004.
    const next = clamp(def, Math.round((base + dir * step) * 1e6) / 1e6);
    if (rc.mutate(() => setTyped(rc, scope, path, next))) input.value = String(next);
  };
  const minus = el('button', { class: 'nc-icon', text: '−', attrs: { type: 'button', 'aria-label': rc.t.decrease } });
  const plus = el('button', { class: 'nc-icon', text: '+', attrs: { type: 'button', 'aria-label': rc.t.increase } });
  minus.disabled = rc.readOnly;
  plus.disabled = rc.readOnly;
  minus.addEventListener('click', bump(-1));
  plus.addEventListener('click', bump(1));
  return el('span', { class: 'nc-stepper' }, minus, input, plus, unit);
}

export function checkbox(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string, onToggle?: (v: boolean) => void): HTMLInputElement {
  const box = el('input', { class: 'nc-check', attrs: { type: 'checkbox', 'aria-label': localText(def.label, rc.lang, def.key), 'data-nc-key': key } });
  box.checked = value === true;
  box.disabled = rc.readOnly;
  box.addEventListener('change', () => {
    if (!rc.mutate(() => setTyped(rc, scope, path, box.checked))) {
      box.checked = !box.checked;
      return;
    }
    onToggle?.(box.checked);
  });
  return box;
}

export function dateInput(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string): HTMLInputElement {
  const s = typeof value === 'string' ? value : '';
  // Une date illisible reste visible telle quelle, en texte, plutôt qu'effacée par le contrôle.
  const isDate = s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s);
  const input = el('input', { class: 'nc-input', attrs: { type: isDate ? 'date' : 'text', 'aria-label': localText(def.label, rc.lang, def.key), 'data-nc-key': key } });
  input.value = s;
  input.readOnly = rc.readOnly;
  input.addEventListener('input', () => rc.mutate(() => setTyped(rc, scope, path, input.value)));
  return input;
}

export function choiceSelect(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string): HTMLSelectElement {
  const select = el('select', { class: 'nc-select', attrs: { 'aria-label': localText(def.label, rc.lang, def.key), 'data-nc-key': key } });
  const current = typeof value === 'string' ? value : '';
  const options = def.options ?? [];
  if (current === '' || !options.some((o) => o.value === current)) {
    // La valeur du fichier, même inconnue de la liste, reste choisie — et intacte.
    const opt = el('option', { text: current === '' ? '—' : current });
    opt.value = current;
    select.append(opt);
  }
  for (const o of options) {
    const opt = el('option', { text: localText(o.label, rc.lang, o.value) });
    opt.value = o.value;
    select.append(opt);
  }
  select.value = current;
  select.disabled = rc.readOnly;
  select.addEventListener('change', () => rc.mutate(() => setTyped(rc, scope, path, select.value)));
  return select;
}

/** La teinte d'une pastille de choix : la couleur de l'option, validée `#rrggbb` par le schéma. */
export function tintForChoice(node: HTMLElement, def: FieldDef, value: unknown): void {
  const color = def.options?.find((o) => o.value === value)?.color;
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) setCssVar(node, '--nc-pill', color);
  else node.style.removeProperty('--nc-pill');
}

export function stars(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string): HTMLElement {
  const max = def.type === 'rating' ? (def.max ?? 5) : Math.max(1, Math.min(10, Math.round(def.max ?? 5)));
  const box = el('span', { class: 'nc-stars', attrs: { role: 'group', 'aria-label': localText(def.label, rc.lang, def.key) } });
  const paint = (n: number) => {
    box.querySelectorAll('button').forEach((b, i) => {
      b.textContent = i < n ? '★' : '☆';
      b.setAttribute('aria-pressed', i < n ? 'true' : 'false');
    });
  };
  for (let i = 1; i <= max; i++) {
    const b = el('button', { class: 'nc-star', attrs: { type: 'button', 'aria-label': rc.t.stars(i, max), 'data-nc-key': `${key}:${i}` } });
    b.disabled = rc.readOnly;
    b.addEventListener('click', () => {
      const cur = getTyped(rc, scope, path)?.value;
      // Cliquer l'étoile déjà posée retire la note.
      const next = cur === i ? 0 : i;
      if (rc.mutate(() => setTyped(rc, scope, path, next))) paint(next);
    });
    box.append(b);
  }
  paint(typeof value === 'number' ? Math.round(value) : 0);
  return box;
}

export function tagsEditor(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string): HTMLElement {
  const box = el('div', { class: 'nc-tags' });
  const render = (tags: string[]) => {
    box.textContent = '';
    tags.forEach((tag, i) => {
      const chip = el('span', { class: 'nc-tag' }, el('span', { text: tag }));
      if (!rc.readOnly) {
        const x = el('button', { class: 'nc-icon', text: '×', attrs: { type: 'button', 'aria-label': `${rc.t.remove} ${tag}` } });
        x.addEventListener('click', () => {
          const next = tags.filter((_, j) => j !== i);
          if (rc.mutate(() => setTyped(rc, scope, path, next))) render(next);
        });
        chip.append(x);
      }
      box.append(chip);
    });
    if (rc.readOnly) {
      if (tags.length === 0) box.append(el('span', { class: 'nc-empty', text: rc.t.empty }));
      return;
    }
    const input = el('input', { class: 'nc-input', attrs: { type: 'text', placeholder: ph(def, rc.lang) ?? rc.t.addTag, 'aria-label': rc.t.addTag, 'data-nc-key': `${key}:add` } });
    const commit = () => {
      const parts = input.value.split(',').map((s) => s.trim()).filter((s) => s !== '' && !tags.includes(s));
      if (parts.length === 0) return;
      const next = [...tags, ...parts];
      if (!rc.mutate(() => setTyped(rc, scope, path, next))) return;
      render(next);
      (box.querySelector('input') as HTMLInputElement | null)?.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commit();
      }
    });
    input.addEventListener('blur', commit);
    box.append(input);
  };
  render(Array.isArray(value) ? (value as string[]) : []);
  return box;
}

/** Une adresse, et le lien sûr qu'elle donne (http, https, mailto). */
export function linkEditor(rc: RenderCtx, scope: Scope, path: string, def: FieldDef, value: unknown, key: string): HTMLElement {
  const kind = def.type === 'email' ? 'email' : 'url';
  const line = el('div', { class: 'nc-linkline' });
  const slot = el('span');
  const refresh = () => {
    slot.textContent = '';
    const cur = getTyped(rc, scope, path)?.value;
    const href = typeof cur === 'string' ? safeHref(cur, kind) : null;
    if (href) slot.append(link(href, kind === 'email' ? words(rc.lang).write : words(rc.lang).open));
  };
  line.append(textInput(rc, scope, path, def, value, key), slot);
  rc.refreshers.push(refresh);
  refresh();
  return line;
}

/** Le contrôle qui convient au type du champ. */
export function controlFor(rc: RenderCtx, scope: Scope, path: string, key: string, opts: { stepper?: boolean } = {}): HTMLElement {
  const t = getTyped(rc, scope, path);
  if (!t) return el('span', { class: 'nc-unknown', text: path });
  const { def, value } = t;
  switch (def.type) {
    case 'longtext':
      return longTextArea(rc, scope, path, def, value, key, 3);
    case 'number':
      return numberInput(rc, scope, path, def, value, key, opts.stepper === true);
    case 'boolean':
      return checkbox(rc, scope, path, def, value, key);
    case 'date':
      return dateInput(rc, scope, path, def, value, key);
    case 'choice':
      return choiceSelect(rc, scope, path, def, value, key);
    case 'rating':
      return stars(rc, scope, path, def, value, key);
    case 'tags':
      return tagsEditor(rc, scope, path, def, value, key);
    case 'url':
    case 'email':
      return linkEditor(rc, scope, path, def, value, key);
    default:
      return textInput(rc, scope, path, def, value, key);
  }
}

export { textInput, formatNumberFor };
