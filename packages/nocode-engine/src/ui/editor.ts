/**
 * editor — `mount(host)` d'une extension sans code : le cycle de vie complet.
 *
 * CE QUE LE MOTEUR PROMET, pour toutes les extensions sans code à la fois :
 *  · un fichier qu'il ne sait pas lire n'est JAMAIS réécrit : écran d'erreur,
 *    aucun `saveBytes`, et `getBytes()` rend les octets reçus, tels quels ;
 *  · un fichier vide est un document neuf (valeurs par défaut) ;
 *  · tant que rien n'a été touché, `getBytes()` rend les octets reçus ;
 *  · en lecture seule (`host.readOnly`, ou un document qu'enregistrer
 *    altérerait), TOUT se fige : les contrôles sont inertes et `mutate` refuse
 *    d'écrire — la garantie est ici, pas dans chaque bouton ;
 *  · `onDirty(true)` à chaque écriture, `onDirty(false)` seulement après un
 *    enregistrement réussi sans écriture pendant l'aller-retour ;
 *  · enregistrement automatique à 2 s, jamais moins ; un conflit de version
 *    suspend l'automatique jusqu'à un geste de l'utilisateur ;
 *  · aucune requête réseau, aucun stockage : le moteur n'en a pas besoin.
 */

import type { ExtensionHost, ExtensionInstance } from '@filarr/extension-api';
import { openDocument } from '../formats/index';
import { implicitListKey } from '../schema';
import { langOf, words } from '../text';
import type { NocodeConfig } from '../types';
import { renderBlocks } from './blocks';
import type { RenderCtx } from './controls';
import { el } from './dom';
import { STYLESHEET } from './style';

export const AUTOSAVE_MS = 2000;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function copy(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

export function mountEditor(host: ExtensionHost, config: NocodeConfig): ExtensionInstance {
  const lang = langOf(host.locale);
  const t = words(lang);
  const initial = copy(host.initialBytes);
  const container = host.container;
  container.textContent = '';

  const style = el('style', { text: STYLESHEET });
  const root = el('div', { class: 'nc-root', attrs: { lang } });
  const setScheme = (scheme: unknown) => root.setAttribute('data-scheme', scheme === 'dark' ? 'dark' : 'light');
  setScheme(host.theme?.scheme);
  if (config.accent && HEX_COLOR_RE.test(config.accent)) root.style.setProperty('--nc-accent', config.accent);
  container.append(style, root);
  const stopTheme =
    typeof host.onThemeChange === 'function' ? host.onThemeChange((theme) => setScheme(theme?.scheme)) : () => undefined;

  const bar = el('div', { class: 'nc-bar' }, el('span', { class: 'nc-file', text: host.fileName }));
  root.append(bar);

  const opened = openDocument(host.initialBytes, config);
  if (!opened.ok) {
    const detail = t.errors[opened.code] ?? opened.code;
    root.append(
      el(
        'div',
        { class: 'nc-error', attrs: { role: 'alert' } },
        el('div', { class: 'nc-error-title', text: t.unreadableTitle }),
        el('div', { class: 'nc-error-detail', text: opened.detail ? `${detail} (${opened.detail.slice(0, 200)})` : detail }),
        el('div', { class: 'nc-hint', text: t.unreadableHint })
      )
    );
    return {
      destroy() {
        stopTheme();
        root.remove();
        style.remove();
      },
      getBytes: () => copy(initial),
    };
  }

  const doc = opened.doc;
  const readOnly = host.readOnly === true || doc.readOnlyReasons.length > 0;
  const status = el('span', { class: 'nc-status', attrs: { 'aria-live': 'polite' } });
  const saveBtn = el('button', { class: 'nc-btn nc-btn-primary', text: t.save, attrs: { type: 'button' } });
  if (readOnly) bar.append(el('span', { class: 'nc-pill-ro', text: t.readOnly }));
  else bar.append(status, saveBtn);

  const banners = el('div');
  root.append(banners);
  if (doc.readOnlyReasons.length > 0) {
    const lines = doc.readOnlyReasons.map((r) => (r.code === 'duplicate_key' ? t.duplicateKey(r.detail) : t.imprecise(r.detail)));
    banners.append(el('div', { class: 'nc-banner', attrs: { 'data-type': 'warn', role: 'status' } }, `${t.forcedReadOnly} ${lines.join(' ')}`));
  }
  const conflictBanner = el('div', { class: 'nc-banner', text: t.conflict, attrs: { 'data-type': 'error', role: 'alert' } });

  const scroll = el('div', { class: 'nc-scroll' });
  const view = el('div', { class: 'nc-view' });
  scroll.append(view);
  root.append(scroll);

  // ── L'état d'enregistrement ─────────────────────────────────────────────
  let modified = false;
  let destroyed = false;
  let dirtySeq = 0;
  let inFlight = false;
  let conflict = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (text: string, type?: 'error' | 'warn') => {
    status.textContent = text;
    if (type) status.setAttribute('data-type', type);
    else status.removeAttribute('data-type');
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (conflict || destroyed) return;
    timer = setTimeout(() => void save(false), AUTOSAVE_MS);
  };

  async function save(manual: boolean): Promise<void> {
    if (readOnly || destroyed) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (!modified && !manual) return;
    if (conflict && !manual) return;
    if (inFlight) {
      schedule();
      return;
    }
    inFlight = true;
    const seq = dirtySeq;
    setStatus(t.saving);
    let bytes: Uint8Array;
    try {
      bytes = doc.serialize();
    } catch {
      inFlight = false;
      setStatus(t.saveFailed, 'error');
      return;
    }
    try {
      await host.saveBytes(bytes);
      inFlight = false;
      if (destroyed) return;
      if (conflict) {
        conflict = false;
        conflictBanner.remove();
      }
      if (dirtySeq === seq) {
        host.onDirty(false);
        setStatus(t.saved);
      } else {
        // Des écritures sont arrivées pendant l'aller-retour : elles restent à enregistrer.
        setStatus(t.modified);
        schedule();
      }
    } catch (e) {
      inFlight = false;
      if (destroyed) return;
      const code = e instanceof Error ? e.message : String(e);
      if (code === 'item_version_conflict') {
        conflict = true;
        banners.append(conflictBanner);
        setStatus(t.saveFailed, 'error');
      } else if (code === 'save_in_flight') {
        setStatus(t.inFlight, 'warn');
        schedule();
      } else {
        setStatus(`${t.saveFailed} (${code.slice(0, 80)})`, 'error');
      }
    }
  }

  // ── Le rendu ────────────────────────────────────────────────────────────
  const rc: RenderCtx = {
    config,
    ctx: doc.ctx,
    lang,
    t,
    readOnly,
    refreshers: [],
    mutate(fn, structural = false) {
      if (readOnly || destroyed) return false;
      fn();
      modified = true;
      dirtySeq++;
      host.onDirty(true);
      setStatus(t.modified);
      schedule();
      if (structural) render();
      else for (const r of rc.refreshers) r();
      return true;
    },
  };

  const implicit = implicitListKey(config.format);
  function render(): void {
    // Le focus revient au même champ après une reconstruction (ajout, retrait…).
    const active = (container.ownerDocument ?? document).activeElement;
    const focusKey = active instanceof HTMLElement && root.contains(active) ? active.getAttribute('data-nc-key') : null;
    rc.refreshers = [];
    view.textContent = '';
    renderBlocks(rc, doc.root, config.view, implicit, 'v', 0, view);
    if (focusKey) {
      for (const node of Array.from(view.querySelectorAll('[data-nc-key]'))) {
        if (node.getAttribute('data-nc-key') === focusKey && node instanceof HTMLElement) {
          node.focus();
          break;
        }
      }
    }
  }
  render();

  const onClick = () => void save(true);
  saveBtn.addEventListener('click', onClick);
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      void save(true);
    }
  };
  root.addEventListener('keydown', onKey);

  return {
    destroy() {
      destroyed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      stopTheme();
      saveBtn.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.remove();
      style.remove();
    },
    getBytes() {
      // Totale : jamais d'exception (elle deviendrait un `fatal` chez l'hôte).
      if (!modified) return copy(initial);
      try {
        return doc.serialize();
      } catch {
        return copy(initial);
      }
    },
  };
}
