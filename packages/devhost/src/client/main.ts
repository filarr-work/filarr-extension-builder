/**
 * main — l'HÔTE simulé : ce que Filarr fait autour de la page bac à sable,
 * rejoué dans un navigateur, sans compte, sans coffre, sans réseau caché.
 *
 *  · modes : éditeur (un fichier d'exemple, ou un document neuf de 0 octet),
 *    fonctions pures, bloc de note, widget d'accueil — selon les capacités ;
 *  · contrôles : clair/sombre (le thème est POUSSÉ, comme dans Filarr), langue,
 *    lecture seule, « simuler un conflit » (`item_version_conflict`), co-édition
 *    (deux pages reliées comme une salle : updates en octets, élu, semis) ;
 *  · panneaux : journal des échanges hôte ↔ page, document, stockage, réseau
 *    (chaque envoi montré avant de partir), fonctions, construction ;
 *  · chaque construction du projet recharge les pages, document conservé.
 */

import { readCallValue, type SandboxFunctionName, type SandboxMode } from '../vendor/sandbox/sandboxProtocol';
import { readExtensionCapabilities, type ExportTarget, type ExtensionCapabilities } from '../vendor/capabilities/extensionCapabilities';
import { initPage, openPage, type MountedPage } from './page';
import { createServices, type NetDecision, type NetRequest, type PickedEntry } from './services';
import { hostTheme } from './theme';
import { download, formatBytes, fromBase64, h, preview, toBase64 } from './util';

interface Manifest {
  id: string;
  name?: string;
  version?: string;
  extensions?: string[];
  capabilities?: unknown;
}

interface BuildState {
  seq: number;
  ok: boolean;
  kind: 'code' | 'nocode';
  errors: string[];
  warnings: string[];
  manifest: Manifest | null;
  bundleBytes: number;
  samples: { name: string; size: number }[];
}

const token = document.querySelector('meta[name="filarr-dev-token"]')?.getAttribute('content') ?? '';
const NEW_DOC = '';

const state = {
  build: null as BuildState | null,
  code: '',
  grants: {} as ExtensionCapabilities,
  sample: null as string | null,
  docName: 'nouveau',
  docBytes: new Uint8Array(),
  docSaves: 0,
  mode: 'editor' as Exclude<SandboxMode, 'function'>,
  scheme: (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as 'light' | 'dark',
  locale: 'fr',
  readOnly: false,
  conflict: false,
  collab: false,
  saveInFlight: false,
  storage: new Map<string, Uint8Array>(),
  picked: new Map<string, PickedEntry>(),
  blockBytes: new Uint8Array(),
  widgetConfig: '',
  secrets: {} as Record<string, string>,
  responsible: 0,
};

let pages: MountedPage[] = [];
let room: Uint8Array[] = [];

// ── La mise en page ─────────────────────────────────────────────────────────
const toolbar = document.getElementById('toolbar') as HTMLElement;
const banner = document.getElementById('banner') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const panel = document.getElementById('panel') as HTMLElement;

const tabs: Record<string, HTMLElement> = {};
const tabBar = h('div', { class: 'tabs' });
panel.append(tabBar);
for (const [id, label] of [
  ['log', 'Journal'],
  ['doc', 'Document'],
  ['storage', 'Stockage'],
  ['net', 'Réseau'],
  ['fn', 'Fonctions'],
  ['build', 'Construction'],
] as const) {
  const body = h('div', { class: 'tab' });
  body.dataset.open = id === 'log' ? 'true' : 'false';
  tabs[id] = body;
  const btn = h('button', { text: label, type: 'button' });
  btn.setAttribute('aria-selected', id === 'log' ? 'true' : 'false');
  btn.addEventListener('click', () => {
    for (const [k, el] of Object.entries(tabs)) el.dataset.open = k === id ? 'true' : 'false';
    for (const b of Array.from(tabBar.children)) b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
  });
  tabBar.append(btn);
  panel.append(body);
}

function log(dir: 'out' | 'in' | 'info' | 'warn' | 'error', text: string, page = 0): void {
  const arrow = dir === 'out' ? `hôte → page ${page + 1}` : dir === 'in' ? `page ${page + 1} → hôte` : dir === 'info' ? 'hôte' : dir === 'warn' ? '!' : '✗';
  const line = h('div', { class: 'log-line' }, h('span', { class: 'dir', text: `${new Date().toLocaleTimeString()} ${arrow} ` }), text);
  line.dataset.dir = dir;
  tabs.log.prepend(line);
  while (tabs.log.childElementCount > 800) tabs.log.lastElementChild?.remove();
}

function setBanner(text: string, type: 'error' | 'warn' | '' = ''): void {
  banner.textContent = text;
  if (type) banner.dataset.type = type;
  else delete banner.dataset.type;
}

// ── Les boîtes : sélecteur et consentement réseau ───────────────────────────
function askPick(opts: { multiple: boolean; extensions?: string[]; access: 'read' | 'readwrite' }): Promise<string[] | null> {
  return new Promise((done) => {
    const samples = (state.build?.samples ?? []).filter((s) => !opts.extensions || opts.extensions.some((e) => s.name.toLowerCase().endsWith(`.${e}`)));
    const dialog = h('dialog');
    const choix = new Set<string>();
    dialog.append(h('h3', { text: `Le sélecteur de Filarr — ${opts.access === 'readwrite' ? 'lecture et écriture' : 'lecture seule'}` }));
    dialog.append(h('p', { class: 'muted', text: 'L’extension ne voit que ce que vous choisissez ici (les fichiers d’exemple du projet).' }));
    if (samples.length === 0) dialog.append(h('p', { text: 'Aucun fichier d’exemple ne convient.' }));
    for (const s of samples) {
      const input = h('input', { type: opts.multiple ? 'checkbox' : 'radio' });
      input.name = 'pick';
      input.addEventListener('change', () => {
        if (!opts.multiple) choix.clear();
        if (input.checked) choix.add(s.name);
        else choix.delete(s.name);
      });
      dialog.append(h('div', { class: 'row' }, h('label', {}, input, `${s.name} (${formatBytes(s.size)})`)));
    }
    const fin = (v: string[] | null) => {
      dialog.close();
      dialog.remove();
      done(v);
    };
    dialog.append(
      h('div', { class: 'row' }, h('button', { text: 'Annuler', type: 'button', on: { click: () => fin(null) } }), h('button', { text: 'Choisir', type: 'button', on: { click: () => fin([...choix]) } }))
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}

const netQueue: { req: NetRequest; resolve(d: NetDecision): void }[] = [];
function renderNet(): void {
  const box = tabs.net;
  box.querySelectorAll('.consent').forEach((n) => n.remove());
  const head = netQueue[0];
  if (!head) return;
  const req = head.req;
  const card = h('div', { class: 'card consent' }, h('h3', { text: 'Requête à confirmer' }), h('div', { text: `${req.method} ${req.url}` }));
  card.append(h('pre', { text: JSON.stringify(req.headers, null, 2) }));
  if (req.body) card.append(h('pre', { text: preview(new Uint8Array(req.body), 2000) }));
  const secrets = ((state.grants.network?.secrets ?? []) as { id: string; label: string; header: string }[]);
  for (const s of secrets) card.append(h('div', { class: 'muted', text: `+ secret « ${s.label} » dans l’en-tête ${s.header} : ${state.secrets[s.id] ? 'renseigné' : 'absent'}` }));
  const decide = (d: NetDecision) => () => {
    netQueue.shift();
    head.resolve(d);
    renderNet();
  };
  card.append(
    h(
      'div',
      { class: 'row' },
      h('button', { text: 'Envoyer', type: 'button', on: { click: decide('send') } }),
      h('button', { text: 'Refuser', type: 'button', on: { click: decide('refuse') } }),
      h('button', { text: 'Bloquer', type: 'button', on: { click: decide('block') } })
    )
  );
  box.prepend(card);
  (tabBar.children[3] as HTMLButtonElement).click();
}

function askNet(req: NetRequest): Promise<NetDecision> {
  if (netQueue.length >= 4) return Promise.reject(new Error('busy'));
  return new Promise((resolve) => {
    netQueue.push({ req, resolve });
    if (netQueue.length === 1) renderNet();
  });
}

async function sendNet(req: NetRequest): Promise<{ status: number; contentType: string; body: Uint8Array }> {
  const r = await fetch('/api/net', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-filarr-dev-token': token },
    body: JSON.stringify({ method: req.method, url: req.url, headers: req.headers, bodyBase64: req.body ? toBase64(new Uint8Array(req.body)) : null, secrets: state.secrets }),
  });
  const out = (await r.json()) as { ok: boolean; code?: string; detail?: string; status: number; contentType: string; bodyBase64: string; hops?: string[] };
  const line = out.ok ? `${req.method} ${req.url} → ${out.status} ${out.contentType} (${(out.hops ?? []).join(' ; ')})` : `${req.method} ${req.url} refusée : ${out.code}${out.detail ? ` (${out.detail})` : ''}`;
  tabs.net.append(h('div', { class: 'log-line', text: line }));
  if (!out.ok) throw new Error(out.code ?? 'net_unreachable');
  return { status: out.status, contentType: out.contentType, body: fromBase64(out.bodyBase64) };
}

// ── Les panneaux ────────────────────────────────────────────────────────────
function renderDoc(): void {
  const box = tabs.doc;
  box.textContent = '';
  const bytes = state.mode === 'block' ? state.blockBytes : state.docBytes;
  box.append(
    h('div', { class: 'card' },
      h('h3', { text: state.mode === 'block' ? 'Charge du bloc' : `Document : ${state.docName}` }),
      h('div', { class: 'muted', text: `${formatBytes(bytes.byteLength)} — ${state.docSaves} enregistrement(s) accepté(s) par l’hôte` }),
      h('pre', { text: preview(bytes) }),
      h('div', { class: 'row' }, h('button', { text: 'Télécharger', type: 'button', on: { click: () => download(bytes, state.docName) } }))
    )
  );
}

function renderStorage(): void {
  const box = tabs.storage;
  box.textContent = '';
  if (!state.grants.storage) {
    box.append(h('p', { class: 'muted', text: 'Capacité storage non déclarée : host.storage n’existe pas.' }));
  } else {
    let total = 0;
    for (const v of state.storage.values()) total += v.byteLength;
    box.append(h('p', { text: `${state.storage.size} clé(s), ${formatBytes(total)} sur ${formatBytes(state.grants.storage.quota)}` }));
    for (const [k, v] of state.storage) box.append(h('div', { class: 'card' }, h('h3', { text: k }), h('pre', { text: preview(v, 1000) })));
    box.append(h('button', { text: 'Tout effacer (désinstallation)', type: 'button', on: { click: () => { state.storage.clear(); renderStorage(); } } }));
  }
  if (state.grants.picker) {
    box.append(h('h3', { text: 'Poignées du sélecteur' }));
    for (const [handle, p] of state.picked) box.append(h('div', { class: 'log-line', text: `${handle} → ${p.name}${p.written ? ` (réécrit, ${formatBytes(p.written.byteLength)})` : ''}` }));
  }
}

function renderBuild(): void {
  const b = state.build;
  const box = tabs.build;
  box.textContent = '';
  if (!b) return;
  const m = b.manifest;
  box.append(h('div', { class: 'card' }, h('h3', { text: `${m?.name ?? '?'} — ${m?.id ?? '?'} ${m?.version ?? ''}` }), h('div', { text: `${b.kind === 'nocode' ? 'Sans code' : 'Avec code'}, construction n° ${b.seq}, bundle de ${formatBytes(b.bundleBytes)}` })));
  if (b.errors.length) box.append(h('div', { class: 'card' }, h('h3', { text: 'Erreurs' }), h('pre', { text: b.errors.join('\n') })));
  if (b.warnings.length) box.append(h('div', { class: 'card' }, h('h3', { text: 'Avertissements' }), h('pre', { text: b.warnings.join('\n') })));
  box.append(h('div', { class: 'card' }, h('h3', { text: 'Capacités accordées par le simulateur' }), h('pre', { text: JSON.stringify(state.grants, null, 2) })));
  const secrets = (state.grants.network?.secrets ?? []) as { id: string; label: string; header: string }[];
  for (const s of secrets) {
    const input = h('input', { type: 'text' });
    input.placeholder = `${s.label} (${s.header})`;
    input.value = state.secrets[s.id] ?? '';
    input.addEventListener('change', () => {
      state.secrets[s.id] = input.value;
    });
    box.append(h('div', { class: 'row' }, h('label', { text: `Secret ${s.id}` }), input));
  }
}

function renderFunctions(): void {
  const box = tabs.fn;
  box.textContent = '';
  const fns = state.grants.functions;
  if (!fns) {
    box.append(h('p', { class: 'muted', text: 'Capacité functions non déclarée.' }));
    return;
  }
  box.append(h('p', { class: 'muted', text: 'Une page SANS AUCUNE API reçoit le document courant, comme Filarr le fait pour la recherche, les vignettes, le tableau et l’export.' }));
  const out = h('div');
  const run = (fn: SandboxFunctionName, to?: ExportTarget) => async () => {
    const holder = h('div');
    document.body.append(holder);
    let page: MountedPage | null = null;
    try {
      page = await openPage({ container: holder, title: 'fonctions', hidden: true, grants: state.grants, onDirty: () => undefined, saveBytes: async () => undefined, onFatal: (m) => log('error', `fonctions : ${m}`), log: (d, t) => log(d, t) });
      await initPage(page, { mode: 'function', code: state.code, editorId: '', fileName: state.docName, readOnly: true, bytes: new Uint8Array(), theme: hostTheme(state.scheme), locale: state.locale });
      const raw = await page.bridge.call({ fn, fileName: state.docName, bytes: state.docBytes, ...(to ? { to } : {}) });
      const value = readCallValue(fn, raw, fns.fields ?? []);
      const card = h('div', { class: 'card' }, h('h3', { text: `${fn}${to ? ` → ${to}` : ''}` }));
      if (value === null) card.append(h('div', { class: 'muted', text: 'valeur REFUSÉE par l’hôte (readCallValue) : mauvaise forme ou hors bornes' }));
      else if (value instanceof Uint8Array) {
        card.append(h('pre', { text: preview(value) }));
        card.append(h('button', { text: 'Télécharger', type: 'button', on: { click: () => download(value, `${state.docName}.${to ?? 'png'}`) } }));
      } else card.append(h('pre', { text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }));
      out.prepend(card);
    } catch (e) {
      out.prepend(h('div', { class: 'card', text: `${fn} : échec (${e instanceof Error ? e.message : String(e)})` }));
    } finally {
      page?.destroy();
      holder.remove();
    }
  };
  const row = h('div', { class: 'row' });
  if (fns.extractText) row.append(h('button', { text: 'extractText', type: 'button', on: { click: run('extractText') } }));
  if (fns.thumbnail) row.append(h('button', { text: 'thumbnail', type: 'button', on: { click: run('thumbnail') } }));
  if (fns.fields) row.append(h('button', { text: 'fields', type: 'button', on: { click: run('fields') } }));
  for (const e of fns.exports ?? []) row.append(h('button', { text: `export ${e.to}`, type: 'button', on: { click: run('export', e.to) } }));
  box.append(row, out);
}

// ── Le montage ──────────────────────────────────────────────────────────────
function frame(title: string): { box: HTMLElement; status: HTMLElement } {
  const status = h('span');
  const box = h('div', { class: 'frame' }, h('div', { class: 'frame-title' }, h('span', { text: title }), status));
  stage.append(box);
  return { box, status };
}

async function hostSave(bytes: Uint8Array, page: number): Promise<void> {
  if (state.readOnly || state.mode === 'widget') throw new Error('read_only');
  if (state.saveInFlight) throw new Error('save_in_flight');
  state.saveInFlight = true;
  try {
    await new Promise((r) => setTimeout(r, 250));
    if (state.conflict) {
      log('warn', 'saveBytes rejeté : item_version_conflict (simulé)', page);
      throw new Error('item_version_conflict');
    }
    if (state.mode === 'block') state.blockBytes = bytes.slice();
    else state.docBytes = bytes.slice();
    state.docSaves++;
    log('info', `enregistré : ${formatBytes(bytes.byteLength)}`, page);
    renderDoc();
  } finally {
    state.saveInFlight = false;
  }
}

async function mountAll(): Promise<void> {
  for (const p of pages) p.destroy();
  pages = [];
  room = [];
  stage.textContent = '';
  const b = state.build;
  if (!b || !b.ok || !b.manifest) {
    setBanner(b ? `Construction refusée :\n${b.errors.join('\n')}` : 'Construction en cours…', 'error');
    return;
  }
  const m = b.manifest;
  const caps = readExtensionCapabilities(m.capabilities ?? {}, m.extensions ?? []);
  state.grants = caps.ok ? caps.capabilities : {};
  setBanner(caps.ok ? (b.warnings.length ? b.warnings.join('\n') : '') : `Capacités refusées par Filarr (${caps.reason}) : l’extension serait refusée à l’installation — montée ici sans capacité.`, caps.ok ? (b.warnings.length ? 'warn' : '') : 'error');
  renderBuild();
  renderStorage();
  renderFunctions();
  renderDoc();

  const mode = state.mode;
  const collab = mode === 'editor' && state.collab && state.grants.collab === true;
  const count = collab ? 2 : 1;
  const theme = hostTheme(state.scheme);
  const bytes = mode === 'block' ? state.blockBytes : mode === 'widget' ? new TextEncoder().encode(state.widgetConfig) : state.docBytes;
  let semee: () => void = () => undefined;
  const seededP = new Promise<void>((r) => {
    semee = r;
  });

  for (let i = 0; i < count; i++) {
    const f = frame(collab ? `Pair ${i + 1}${i === state.responsible ? ' — élu' : ''}` : mode === 'editor' ? state.docName : mode === 'block' ? 'Bloc de note' : 'Widget d’accueil');
    const services = createServices({
      grants: state.grants,
      storage: state.storage,
      picked: state.picked,
      askPick,
      readSample: async (name) => new Uint8Array(await (await fetch(`/api/samples/${encodeURIComponent(name)}`)).arrayBuffer()),
      askNet,
      sendNet,
      onChange: renderStorage,
      log: (k, t) => log(k, t, i),
    });
    const page = await openPage({
      container: f.box,
      title: f.box.textContent ?? '',
      grants: state.grants,
      services: state.grants.storage || state.grants.picker || state.grants.network ? services : undefined,
      collab: collab
        ? {
            send: (u) => {
              room.push(u.slice());
              pages.forEach((p, j) => {
                if (j !== i) p.bridge.pushCollabUpdate(u);
              });
            },
            seeded: () => {
              log('info', 'salle semée', i);
              semee();
            },
          }
        : undefined,
      onDirty: (d) => {
        f.status.textContent = d ? '● modifié' : '';
      },
      saveBytes: (bb) => hostSave(bb, i),
      onFatal: (msg) => {
        log('error', `fatal : ${msg}`, i);
        setBanner(`Le plugin isolé a cessé de fonctionner : ${msg}`, 'error');
      },
      log: (d, t) => log(d, t, i),
    });
    pages.push(page);
    try {
      await initPage(page, {
        mode,
        code: state.code,
        editorId: mode === 'editor' ? `${m.id}-editor` : '',
        fileName: state.docName,
        readOnly: mode === 'widget' ? true : state.readOnly,
        bytes,
        theme,
        locale: state.locale,
        ...(collab ? { collab: { seed: i === 0 && room.length === 0, responsible: i === state.responsible, updates: room.map((u) => u.slice()) } } : {}),
      });
      log('info', 'monté', i);
      if (collab && i === 0) await Promise.race([seededP, new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('error', `mount-error : ${msg}`, i);
      setBanner(`Montage refusé : ${msg}`, 'error');
    }
  }
}

async function refresh(): Promise<void> {
  const r = await fetch('/api/state');
  state.build = (await r.json()) as BuildState;
  state.code = state.build.ok ? await (await fetch('/api/bundle')).text() : '';
  renderToolbar();
  await mountAll();
}

async function loadSample(name: string | null): Promise<void> {
  state.sample = name;
  if (name === null || name === NEW_DOC) {
    const ext = state.build?.manifest?.extensions?.[0] ?? 'txt';
    state.docName = `nouveau.${ext}`;
    state.docBytes = new Uint8Array();
  } else {
    state.docName = name;
    state.docBytes = new Uint8Array(await (await fetch(`/api/samples/${encodeURIComponent(name)}`)).arrayBuffer());
  }
  state.docSaves = 0;
}

// ── La barre d'outils ───────────────────────────────────────────────────────
function renderToolbar(): void {
  toolbar.textContent = '';
  const b = state.build;
  toolbar.append(h('h1', { text: `Simulateur Filarr — ${b?.manifest?.name ?? '…'}` }));

  const samples = h('select');
  samples.append(new Option('(document neuf, 0 octet)', NEW_DOC));
  for (const s of b?.samples ?? []) samples.append(new Option(`${s.name} (${formatBytes(s.size)})`, s.name));
  samples.value = state.sample ?? NEW_DOC;
  samples.addEventListener('change', async () => {
    await loadSample(samples.value === NEW_DOC ? null : samples.value);
    await mountAll();
  });
  toolbar.append(h('label', { text: 'Fichier ' }, samples));

  const caps = (b?.manifest?.capabilities ?? {}) as ExtensionCapabilities;
  const modeSel = h('select');
  modeSel.append(new Option('Éditeur', 'editor'));
  if (caps.noteBlock) modeSel.append(new Option('Bloc de note', 'block'));
  if (caps.homeWidget) modeSel.append(new Option('Widget d’accueil', 'widget'));
  modeSel.value = state.mode;
  modeSel.addEventListener('change', () => {
    state.mode = modeSel.value as typeof state.mode;
    renderToolbar();
    void mountAll();
  });
  if (modeSel.options.length > 1) toolbar.append(h('label', { text: 'Mode ' }, modeSel));
  if (state.mode === 'widget') {
    const cfg = h('input', { type: 'text' });
    cfg.maxLength = 240;
    cfg.value = state.widgetConfig;
    cfg.placeholder = 'config du widget (240 caractères)';
    cfg.addEventListener('change', () => {
      state.widgetConfig = cfg.value;
      void mountAll();
    });
    toolbar.append(cfg);
  }

  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, remount: boolean, title?: string) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = get();
    box.addEventListener('change', () => {
      set(box.checked);
      if (remount) void mountAll();
    });
    toolbar.append(h('label', { title }, box, label));
  };
  toggle('Sombre', () => state.scheme === 'dark', (v) => {
    state.scheme = v ? 'dark' : 'light';
    for (const p of pages) p.bridge.pushTheme(hostTheme(state.scheme));
    log('info', `thème poussé : ${state.scheme}`);
  }, false, 'Pousse le thème aux pages, comme Filarr quand l’application change de thème');
  toggle('English', () => state.locale === 'en', (v) => {
    state.locale = v ? 'en' : 'fr';
  }, true);
  toggle('Lecture seule', () => state.readOnly, (v) => {
    state.readOnly = v;
  }, true);
  toggle('Simuler un conflit', () => state.conflict, (v) => {
    state.conflict = v;
  }, false, 'saveBytes rejette item_version_conflict tant que la case est cochée');
  if (caps.collab) {
    toggle('Co-édition (2 pairs)', () => state.collab, (v) => {
      state.collab = v;
    }, true);
    toolbar.append(h('button', {
      text: 'Changer d’élu',
      type: 'button',
      on: {
        click: () => {
          if (pages.length < 2) return;
          state.responsible = 1 - state.responsible;
          pages.forEach((p, i) => p.bridge.pushCollabState(i === state.responsible));
          log('info', `élu : pair ${state.responsible + 1}`);
        },
      },
    }));
  }
  toolbar.append(
    h('button', {
      text: 'Enregistrer (getBytes)',
      type: 'button',
      title: 'Ce que fait le bouton « Enregistrer » de la fenêtre de Filarr : demande les octets à la page, puis écrit — y compris par-dessus un conflit',
      on: {
        click: async () => {
          const p = pages[0];
          if (!p) return;
          try {
            const bytes = await p.bridge.requestBytes();
            if (state.conflict) {
              state.conflict = false;
              log('warn', 'conflit levé : écrasement délibéré');
              renderToolbar();
            }
            if (state.mode === 'block') state.blockBytes = bytes;
            else state.docBytes = bytes;
            state.docSaves++;
            log('info', `getBytes : ${formatBytes(bytes.byteLength)}`);
            renderDoc();
          } catch (e) {
            log('error', `getBytes : ${e instanceof Error ? e.message : String(e)}`);
          }
        },
      },
    }),
    h('button', { text: 'Recharger', type: 'button', on: { click: () => void mountAll() } }),
    h('button', { text: 'Rouvrir l’exemple', type: 'button', on: { click: async () => { await loadSample(state.sample); await mountAll(); } } })
  );
}

// ── Le démarrage ────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  const r = await fetch('/api/state');
  state.build = (await r.json()) as BuildState;
  await loadSample(state.build.samples[0]?.name ?? null);
  state.code = state.build.ok ? await (await fetch('/api/bundle')).text() : '';
  renderToolbar();
  await mountAll();
  let seq = state.build.seq;
  const events = new EventSource('/api/events');
  events.addEventListener('build', (ev) => {
    const data = JSON.parse((ev as MessageEvent).data) as { seq: number };
    if (data.seq === seq) return;
    seq = data.seq;
    log('info', `nouvelle construction (n° ${seq}) : rechargement`);
    void refresh();
  });
}

void start();
