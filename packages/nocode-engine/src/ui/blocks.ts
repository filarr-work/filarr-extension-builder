/**
 * blocks — les blocs de vue, un par type déclaré dans la configuration.
 *
 * Un bloc reçoit un NIVEAU (`Scope`) : la racine du document, ou un élément de
 * liste pour les blocs posés dans une carte. Il lit et écrit par chemin, jamais
 * autrement. Ajouter, retirer, déplacer sont des écritures STRUCTURELLES : la
 * vue est reconstruite, le focus revient au même champ (`data-nc-key`).
 */

import { computeValue, progressOf } from '../compute';
import type { ListAccess, Scope } from '../model';
import { displayValue, fieldLabel, formatNumberFor } from '../present';
import { localText } from '../text';
import type { BlockDef, FieldDef, LocalText } from '../types';
import {
  checkbox,
  choiceSelect,
  controlFor,
  getTyped,
  longTextArea,
  numberInput,
  stars,
  tagsEditor,
  textInput,
  tintForChoice,
  dateInput,
  linkEditor,
  type RenderCtx,
} from './controls';
import { el, setCssVar } from './dom';

type Block<T extends BlockDef['type']> = Extract<BlockDef, { type: T }>;

function labelOf(rc: RenderCtx, text: LocalText | undefined, fallback = ''): string {
  return localText(text, rc.lang, fallback);
}

function wrap(rc: RenderCtx, label: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return el('div', { class: 'nc-block' }, label ? el('div', { class: 'nc-label', text: label }) : null, ...children);
}

function firstKey(fields: readonly FieldDef[] | undefined, types: string[]): string | undefined {
  return fields?.find((f) => types.includes(f.type))?.key;
}

function itemDef(list: ListAccess, key: string | undefined): FieldDef | undefined {
  return key ? list.def.fields?.find((f) => f.key === key) : undefined;
}

/** Les petits boutons d'une ligne : monter, descendre, retirer. */
function rowTools(rc: RenderCtx, list: ListAccess, i: number, opts: { move: boolean; className?: string } = { move: true }): HTMLElement | null {
  if (rc.readOnly) return null;
  const tools = el('span', { class: opts.className ?? 'nc-row-tools' });
  if (opts.move) {
    const up = el('button', { class: 'nc-icon', text: '↑', attrs: { type: 'button', 'aria-label': rc.t.moveUp, title: rc.t.moveUp } });
    const down = el('button', { class: 'nc-icon', text: '↓', attrs: { type: 'button', 'aria-label': rc.t.moveDown, title: rc.t.moveDown } });
    up.disabled = i === 0;
    down.disabled = i === list.length() - 1;
    up.addEventListener('click', () => rc.mutate(() => list.move(i, i - 1), true));
    down.addEventListener('click', () => rc.mutate(() => list.move(i, i + 1), true));
    tools.append(up, down);
  }
  const del = el('button', { class: 'nc-icon', text: '×', attrs: { type: 'button', 'aria-label': rc.t.remove, title: rc.t.remove } });
  del.addEventListener('click', () => rc.mutate(() => list.remove(i), true));
  tools.append(del);
  return tools;
}

/** Une zone « ajouter » : un texte à saisir (Entrée) et un bouton. */
function addRow(rc: RenderCtx, key: string, placeholder: string, onAdd: (text: string) => void, withInput: boolean): HTMLElement | null {
  if (rc.readOnly) return null;
  const btn = el('button', { class: 'nc-btn', text: `+ ${placeholder}`, attrs: { type: 'button', 'data-nc-key': `${key}:btn` } });
  if (!withInput) {
    btn.addEventListener('click', () => onAdd(''));
    return el('div', { class: 'nc-add' }, btn);
  }
  btn.textContent = rc.t.add;
  const input = el('input', { class: 'nc-input', attrs: { type: 'text', placeholder, 'aria-label': placeholder, 'data-nc-key': `${key}:add` } });
  const go = () => {
    const v = input.value.trim();
    if (v === '') return;
    onAdd(v);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });
  btn.addEventListener('click', go);
  return el('div', { class: 'nc-add' }, input, btn);
}

// ── Les blocs ───────────────────────────────────────────────────────────────

function title(rc: RenderCtx, scope: Scope, b: Block<'title'>, key: string): HTMLElement {
  const t = getTyped(rc, scope, b.field);
  if (!t) return el('div');
  const def = { ...t.def, placeholder: b.placeholder ?? t.def.placeholder };
  const input = textInput(rc, scope, b.field, def, t.value, key, 'nc-title');
  return el('div', { class: 'nc-block' }, input);
}

function badges(rc: RenderCtx, scope: Scope, b: Block<'badges'>, key: string): HTMLElement {
  const row = el('div', { class: 'nc-badges' });
  b.items.forEach((it, i) => {
    const t = getTyped(rc, scope, it.field);
    if (!t) return;
    const label = it.label ? localText(it.label, rc.lang) : fieldLabel(t.def, rc.lang);
    const pill = el('span', { class: 'nc-badge' }, el('span', { class: 'nc-badge-label', text: label }));
    const k = `${key}:${i}`;
    switch (t.def.type) {
      case 'choice': {
        const select = choiceSelect(rc, scope, it.field, t.def, t.value, k);
        tintForChoice(pill, t.def, t.value);
        select.addEventListener('change', () => tintForChoice(pill, t.def, select.value));
        pill.append(select);
        break;
      }
      case 'number':
        pill.append(numberInput(rc, scope, it.field, t.def, t.value, k, it.stepper === true));
        break;
      case 'boolean':
        pill.append(checkbox(rc, scope, it.field, t.def, t.value, k));
        break;
      case 'rating':
        pill.append(stars(rc, scope, it.field, t.def, t.value, k));
        break;
      case 'date':
        pill.append(dateInput(rc, scope, it.field, t.def, t.value, k));
        break;
      default:
        pill.append(textInput(rc, scope, it.field, t.def, t.value, k));
    }
    row.append(pill);
  });
  return row;
}

function checklist(rc: RenderCtx, scope: Scope, b: Block<'checklist'>, key: string, implicit: string | null): HTMLElement {
  const list = scope.list(b.field ?? implicit ?? '');
  const check = b.check ?? firstKey(list.def.fields, ['boolean']);
  const text = b.text ?? firstKey(list.def.fields, ['text', 'longtext']);
  const checkDef = itemDef(list, check);
  const textDef = itemDef(list, text);
  const ul = el('ul', { class: 'nc-list' });
  const n = list.length();
  for (let i = 0; i < n; i++) {
    const item = list.item(i);
    if (!item) {
      ul.append(el('li', { class: 'nc-row nc-unknown', text: rc.t.unknownItem }));
      continue;
    }
    const li = el('li', { class: 'nc-row' });
    const v = checkDef && check ? getTyped(rc, item, check)?.value === true : false;
    if (v) li.setAttribute('data-type', 'done');
    if (checkDef && check) {
      li.append(
        checkbox(rc, item, check, checkDef, v, `${key}:${i}:c`, (on) => {
          if (on) li.setAttribute('data-type', 'done');
          else li.removeAttribute('data-type');
        })
      );
    }
    if (textDef && text) li.append(textInput(rc, item, text, textDef, getTyped(rc, item, text)?.value, `${key}:${i}:t`));
    const tools = rowTools(rc, list, i);
    if (tools) li.append(tools);
    ul.append(li);
  }
  if (n === 0) ul.append(el('li', { class: 'nc-empty', text: rc.t.empty }));
  const compteur = el('span', { class: 'nc-hint' });
  const refresh = () => {
    let d = 0;
    for (let i = 0; i < list.length(); i++) {
      const item = list.item(i);
      if (item && check && getTyped(rc, item, check)?.value === true) d++;
    }
    compteur.textContent = list.length() > 0 ? ` ${d} / ${list.length()}` : '';
  };
  rc.refreshers.push(refresh);
  refresh();
  const label = el('div', { class: 'nc-label', text: labelOf(rc, b.label, list.def.label ? fieldLabel(list.def, rc.lang) : '') }, compteur);
  const add = addRow(
    rc,
    key,
    labelOf(rc, b.addLabel, rc.t.addItem),
    (value) =>
      rc.mutate(() => {
        const at = list.add();
        const item = list.item(at);
        if (item && text && textDef) item.set(text, value);
      }, true),
    true
  );
  return el('div', { class: 'nc-block' }, label, ul, add);
}

function steps(rc: RenderCtx, scope: Scope, b: Block<'steps'>, key: string): HTMLElement {
  const list = scope.list(b.field);
  const isText = list.def.type === 'textlist';
  const text = isText ? undefined : (b.text ?? firstKey(list.def.fields, ['text', 'longtext']));
  const textDef: FieldDef = isText ? { key: '', type: 'longtext', label: list.def.label, placeholder: list.def.placeholder } : (itemDef(list, text) ?? { key: '', type: 'longtext' });
  const ol = el('ol', { class: 'nc-steps' });
  const n = list.length();
  for (let i = 0; i < n; i++) {
    const li = el('li', { class: 'nc-step' }, el('span', { class: 'nc-step-num', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }));
    if (isText) {
      const ta = el('textarea', { class: 'nc-textarea', attrs: { rows: '2', 'aria-label': `${i + 1}`, 'data-nc-key': `${key}:${i}` } });
      ta.value = list.text(i);
      ta.readOnly = rc.readOnly;
      ta.addEventListener('input', () => rc.mutate(() => list.setText(i, ta.value)));
      li.append(ta);
    } else {
      const item = list.item(i);
      if (!item || !text) li.append(el('span', { class: 'nc-unknown', text: rc.t.unknownItem }));
      else li.append(longTextArea(rc, item, text, textDef, getTyped(rc, item, text)?.value, `${key}:${i}`, 2));
    }
    const tools = rowTools(rc, list, i);
    if (tools) li.append(tools);
    ol.append(li);
  }
  if (n === 0) ol.append(el('li', { class: 'nc-empty', text: rc.t.empty }));
  const add = addRow(
    rc,
    key,
    labelOf(rc, b.addLabel, rc.t.addStep),
    () => rc.mutate(() => void list.add(''), true),
    false
  );
  return wrap(rc, labelOf(rc, b.label, fieldLabel(list.def, rc.lang)), ol, add);
}

function table(rc: RenderCtx, scope: Scope, b: Block<'table'>, key: string, implicit: string | null): HTMLElement {
  const list = scope.list(b.field ?? implicit ?? '');
  const scalar = ['text', 'longtext', 'number', 'boolean', 'date', 'url', 'email', 'choice', 'tags', 'rating'];
  const cols = (b.columns ?? (list.def.fields ?? []).filter((f) => scalar.includes(f.type)).map((f) => f.key))
    .map((k) => itemDef(list, k))
    .filter((f): f is FieldDef => f !== undefined);
  const thead = el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { text: fieldLabel(c, rc.lang), attrs: { scope: 'col', 'data-type': c.type } })), rc.readOnly ? null : el('th', { attrs: { 'aria-hidden': 'true' } })));
  const tbody = el('tbody');
  const n = list.length();
  for (let i = 0; i < n; i++) {
    const item = list.item(i);
    if (!item) continue;
    const tr = el('tr');
    cols.forEach((c, j) => tr.append(el('td', { attrs: { 'data-type': c.type } }, controlFor(rc, item, c.key, `${key}:${i}:${j}`))));
    const tools = rowTools(rc, list, i, { move: true, className: 'nc-row-tools' });
    if (tools) tr.append(el('td', {}, tools));
    tbody.append(tr);
  }
  const tableEl = el('table', { class: 'nc-table' }, thead, tbody);
  const content: (HTMLElement | null)[] = [el('div', { class: 'nc-table-wrap' }, tableEl)];
  if (n === 0) content.push(el('div', { class: 'nc-empty', text: rc.t.empty }));
  content.push(addRow(rc, key, labelOf(rc, b.addLabel, rc.t.addRow), () => rc.mutate(() => void list.add(), true), false));
  return wrap(rc, labelOf(rc, b.label), ...content);
}

function section(rc: RenderCtx, scope: Scope, b: Block<'section'>, key: string, implicit: string | null, depth: number): HTMLElement {
  const details = el('details', { class: 'nc-section' });
  details.open = b.collapsed !== true;
  details.append(el('summary', { text: localText(b.title, rc.lang) }));
  const body = el('div', { class: 'nc-section-body' });
  renderBlocks(rc, scope, b.blocks, implicit, key, depth + 1, body);
  details.append(body);
  return details;
}

function cards(rc: RenderCtx, scope: Scope, b: Block<'cards'>, key: string, depth: number): HTMLElement {
  const list = scope.list(b.field);
  const box = el('div', { class: 'nc-cards' });
  const n = list.length();
  for (let i = 0; i < n; i++) {
    const item = list.item(i);
    if (!item) {
      box.append(el('div', { class: 'nc-card nc-unknown', text: rc.t.unknownItem }));
      continue;
    }
    const card = el('div', { class: 'nc-card' });
    const tools = rowTools(rc, list, i, { move: true, className: 'nc-card-tools' });
    if (tools) card.append(tools);
    renderBlocks(rc, item, b.blocks, null, `${key}:${i}`, depth + 1, card);
    box.append(card);
  }
  if (n === 0) box.append(el('div', { class: 'nc-empty', text: rc.t.empty }));
  const add = addRow(rc, key, labelOf(rc, b.addLabel, rc.t.addItem), () => rc.mutate(() => void list.add(), true), false);
  return wrap(rc, labelOf(rc, b.label, fieldLabel(list.def, rc.lang)), box, add);
}

function progress(rc: RenderCtx, scope: Scope, b: Block<'progress'>, implicit: string | null): HTMLElement {
  const fill = el('div', { class: 'nc-progress-fill' });
  const track = el('div', { class: 'nc-progress-track', attrs: { role: 'progressbar', 'aria-valuemin': '0' } }, fill);
  const text = el('span', { class: 'nc-progress-text' });
  const refresh = () => {
    const p = progressOf(scope, b, implicit, rc.ctx);
    const pct = p && p.max > 0 ? Math.max(0, Math.min(100, (p.value / p.max) * 100)) : 0;
    setCssVar(fill, '--nc-pct', `${pct.toFixed(1)}%`);
    track.setAttribute('aria-valuemax', String(p?.max ?? 0));
    track.setAttribute('aria-valuenow', String(p?.value ?? 0));
    text.textContent = p ? `${formatNumberFor(p.value, rc.lang)} / ${formatNumberFor(p.max, rc.lang)}` : '—';
  };
  rc.refreshers.push(refresh);
  refresh();
  const label = b.label ? localText(b.label, rc.lang) : b.field ? (getTyped(rc, scope, b.field) ? fieldLabel(getTyped(rc, scope, b.field)!.def, rc.lang) : '') : '';
  return wrap(rc, label, el('div', { class: 'nc-progress' }, track, text));
}

function total(rc: RenderCtx, scope: Scope, b: Block<'total'>, implicit: string | null): HTMLElement {
  const value = el('span', { class: 'nc-total-value', attrs: { 'aria-live': 'polite' } });
  const refresh = () => {
    const v = computeValue(scope, b.compute, implicit, rc.ctx);
    const unit = localText(b.unit, rc.lang);
    value.textContent = v === null ? '—' : `${formatNumberFor(v, rc.lang, b.decimals)}${unit ? ` ${unit}` : ''}`;
  };
  rc.refreshers.push(refresh);
  refresh();
  return el('div', { class: 'nc-total' }, el('span', { class: 'nc-label', text: localText(b.label, rc.lang) }), value);
}

function fieldsForm(rc: RenderCtx, scope: Scope, b: Block<'fields'>, key: string): HTMLElement {
  const form = el('div', { class: 'nc-form' });
  b.fields.forEach((path, i) => {
    const t = getTyped(rc, scope, path);
    if (!t) return;
    form.append(el('span', { class: 'nc-label', text: fieldLabel(t.def, rc.lang) }), controlFor(rc, scope, path, `${key}:${i}`));
  });
  return wrap(rc, labelOf(rc, b.label), form);
}

function single(rc: RenderCtx, scope: Scope, b: Block<'longtext' | 'number' | 'tags' | 'date' | 'link' | 'rating'>, key: string): HTMLElement {
  const t = getTyped(rc, scope, b.field);
  if (!t) return el('div');
  const label = labelOf(rc, b.label, fieldLabel(t.def, rc.lang));
  switch (b.type) {
    case 'longtext':
      return wrap(rc, label, longTextArea(rc, scope, b.field, t.def, t.value, key, b.rows ?? 5));
    case 'number':
      return wrap(rc, label, numberInput(rc, scope, b.field, t.def, t.value, key, true));
    case 'tags':
      return wrap(rc, label, tagsEditor(rc, scope, b.field, t.def, t.value, key));
    case 'date':
      return wrap(rc, label, dateInput(rc, scope, b.field, t.def, t.value, key));
    case 'link':
      return wrap(rc, label, linkEditor(rc, scope, b.field, t.def, t.value, key));
    case 'rating':
      return wrap(rc, label, stars(rc, scope, b.field, t.def, t.value, key));
  }
}

/** Pose les blocs `blocks` dans `into`, au niveau `scope`. */
export function renderBlocks(rc: RenderCtx, scope: Scope, blocks: BlockDef[], implicit: string | null, keyPrefix: string, depth: number, into: HTMLElement): void {
  blocks.forEach((b, i) => {
    const key = `${keyPrefix}/${i}`;
    let node: HTMLElement;
    switch (b.type) {
      case 'title':
        node = title(rc, scope, b, key);
        break;
      case 'badges':
        node = badges(rc, scope, b, key);
        break;
      case 'checklist':
        node = checklist(rc, scope, b, key, implicit);
        break;
      case 'steps':
        node = steps(rc, scope, b, key);
        break;
      case 'table':
        node = table(rc, scope, b, key, implicit);
        break;
      case 'section':
        node = section(rc, scope, b, key, implicit, depth);
        break;
      case 'cards':
        node = cards(rc, scope, b, key, depth);
        break;
      case 'progress':
        node = progress(rc, scope, b, implicit);
        break;
      case 'total':
        node = total(rc, scope, b, implicit);
        break;
      case 'fields':
        node = fieldsForm(rc, scope, b, key);
        break;
      default:
        node = single(rc, scope, b, key);
    }
    into.append(node);
  });
}

export { displayValue };
