/**
 * Simulator — « Simulateur Filarr » : le bundle monté dans la page bac à sable
 * de Filarr (copie vendorisée, sa CSP, iframe `sandbox="allow-scripts"` SANS
 * `allow-same-origin`), par l'hôte navigateur de `packages/devhost` — le même
 * pont vendorisé que Filarr, les mêmes services simulés.
 *
 * C'est le SEUL endroit où le code de l'auteur s'exécute. L'atelier n'en voit
 * que des messages résumés dans le journal, affichés comme du texte.
 *
 * Différence avec `filarr-ext dev` : aucune requête réseau ne part d'ici. Le
 * Builder n'a pas de serveur pour les relayer et n'en émet aucune lui-même ; la
 * capacité `network` est montrée, puis refusée (`net_refused`), avec le
 * pourquoi dans le journal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { readExtensionCapabilities, type ExportTarget, type ExtensionCapabilities, type ExtensionManifest } from '@filarr/extension-api';
import { initPage, openPage, type MountedPage } from '@filarr-devhost/client/page';
import { createServices, type NetRequest, type PickedEntry } from '@filarr-devhost/client/services';
import { hostTheme } from '@filarr-devhost/client/theme';
import { preview, summarize } from '@filarr-devhost/client/util';
import { readCallValue, type SandboxFunctionName } from '@filarr-devhost/vendor/sandbox/sandboxProtocol';
import { Modal } from '../components/chrome';
import { formatBytes } from '../lib/bytes';
import type { SandboxProbe } from '../lib/checks';
import { usePrefs } from '../state/prefs';

export interface Sample {
  name: string;
  bytes: Uint8Array;
}

type Dir = 'out' | 'in' | 'info' | 'warn' | 'error';
interface LogLine {
  id: number;
  t: string;
  dir: Dir;
  text: string;
}

export interface SimulatorProps {
  code: string | null;
  /** Change à chaque construction : la page est rechargée, le document gardé. */
  buildKey: number;
  manifest: ExtensionManifest | null;
  samples: Sample[];
  /** Aperçu de la vue sans code : moins de commandes, pas de journal ouvert. */
  compact?: boolean;
  scheme?: 'light' | 'dark';
  onProbe?(p: SandboxProbe): void;
  /** L'auteur a écrit des octets (Enregistrer) : le document du simulateur. */
  title?: string;
}

const NEW_DOC = '\u0000nouveau';

export function Simulator({ code, buildKey, manifest, samples, compact = false, scheme: schemeProp, onProbe, title }: SimulatorProps) {
  const { tr, lang, scheme: atelierScheme } = usePrefs();
  const stageRef = useRef<HTMLDivElement>(null);
  const pages = useRef<MountedPage[]>([]);
  const room = useRef<Uint8Array[]>([]);
  const gen = useRef(0);
  const storage = useRef(new Map<string, Uint8Array>());
  const picked = useRef(new Map<string, PickedEntry>());
  const logId = useRef(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [scheme, setScheme] = useState<'light' | 'dark'>(schemeProp ?? atelierScheme);
  const [readOnly, setReadOnly] = useState(false);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  conflictRef.current = conflict;
  const [collab, setCollab] = useState(false);
  const [mode, setMode] = useState<'editor' | 'block' | 'widget'>('editor');
  const [sampleName, setSampleName] = useState<string>(samples[0]?.name ?? NEW_DOC);
  const [docBytes, setDocBytes] = useState<Uint8Array>(samples[0]?.bytes ?? new Uint8Array());
  const docRef = useRef(docBytes);
  const [saves, setSaves] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fnResult, setFnResult] = useState<string | null>(null);
  const [pick, setPick] = useState<{ names: string[]; multiple: boolean; access: string; resolve(v: string[] | null): void } | null>(null);
  const [pickSel, setPickSel] = useState<string[]>([]);
  const savingRef = useRef(false);

  useEffect(() => {
    if (schemeProp) setScheme(schemeProp);
  }, [schemeProp]);

  const write = useCallback((dir: Dir, text: string, page = 0) => {
    const arrow = dir === 'out' ? (lang === 'fr' ? `hôte → page${page ? ` ${page + 1}` : ''}` : `host → page${page ? ` ${page + 1}` : ''}`) : dir === 'in' ? (lang === 'fr' ? `page${page ? ` ${page + 1}` : ''} → hôte` : `page${page ? ` ${page + 1}` : ''} → host`) : dir === 'info' ? (lang === 'fr' ? 'hôte' : 'host') : dir === 'warn' ? '!' : '✗';
    const line: LogLine = { id: ++logId.current, t: new Date().toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB'), dir, text: `${arrow} · ${text}` };
    setLog((l) => [line, ...l].slice(0, 300));
  }, [lang]);

  // Le document suit l'exemple choisi ; il est GARDÉ d'une construction à l'autre.
  const sampleList = samples.map((s) => s.name).join('\u0001');
  useEffect(() => {
    if (sampleName !== NEW_DOC && !samples.some((s) => s.name === sampleName)) {
      const first = samples[0];
      setSampleName(first?.name ?? NEW_DOC);
      setDocBytes(first?.bytes ?? new Uint8Array());
      docRef.current = first?.bytes ?? new Uint8Array();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleList]);

  const caps: ExtensionCapabilities = (() => {
    if (!manifest) return {};
    const v = readExtensionCapabilities(manifest.capabilities ?? {}, manifest.extensions ?? []);
    return v.ok ? v.capabilities : {};
  })();
  const docName = sampleName === NEW_DOC ? `nouveau.${manifest?.extensions?.[0] ?? 'txt'}` : sampleName;

  const destroyAll = () => {
    for (const p of pages.current) p.destroy();
    pages.current = [];
    room.current = [];
    if (stageRef.current) stageRef.current.textContent = '';
  };

  const mountAll = useCallback(async () => {
    const mine = ++gen.current;
    destroyAll();
    setBanner(null);
    setDirty(false);
    const stage = stageRef.current;
    if (!stage || !code || !manifest) return;
    const capsV = readExtensionCapabilities(manifest.capabilities ?? {}, manifest.extensions ?? []);
    const grants: ExtensionCapabilities = capsV.ok ? capsV.capabilities : {};
    if (!capsV.ok) setBanner(tr(`Capacités refusées par Filarr (${capsV.reason}) : l’extension serait refusée à l’installation — montée ici sans capacité.`, `Capabilities refused by Filarr (${capsV.reason}): the extension would be refused at install — mounted here without capabilities.`));
    const m = mode === 'block' && grants.noteBlock ? 'block' : mode === 'widget' && grants.homeWidget ? 'widget' : 'editor';
    const isCollab = m === 'editor' && collab && grants.collab === true;
    const count = isCollab ? 2 : 1;
    const bytes = m === 'widget' ? new Uint8Array() : docRef.current;
    let seeded: () => void = () => undefined;
    const seededP = new Promise<void>((r) => {
      seeded = r;
    });
    for (let i = 0; i < count; i++) {
      if (mine !== gen.current) return;
      const box = document.createElement('div');
      box.className = 'sim-frame';
      if (isCollab) {
        const head = document.createElement('div');
        head.className = 'sim-frame-title';
        head.textContent = tr(`Pair ${i + 1}${i === 0 ? ' — élu' : ''}`, `Peer ${i + 1}${i === 0 ? ' — elected' : ''}`);
        box.append(head);
      }
      stage.append(box);
      const services = createServices({
        grants,
        storage: storage.current,
        picked: picked.current,
        askPick: (opts) =>
          new Promise((resolve) => {
            const names = samples.filter((s) => !opts.extensions || opts.extensions.some((e) => s.name.toLowerCase().endsWith(`.${e}`))).map((s) => s.name);
            setPickSel([]);
            setPick({ names, multiple: opts.multiple, access: opts.access, resolve });
          }),
        readSample: async (name) => samples.find((s) => s.name === name)?.bytes.slice() ?? new Uint8Array(),
        askNet: async (req: NetRequest) => {
          write('warn', tr(`requête réseau ${req.method} ${req.url} : refusée — le Builder n’émet aucune requête. Essayez-la avec « npx filarr-ext dev », qui la montre puis la relaie vers les domaines déclarés.`, `network request ${req.method} ${req.url}: refused — the Builder sends no request. Try it with “npx filarr-ext dev”, which shows it and relays it to the declared domains.`), i);
          return 'refuse';
        },
        sendNet: async () => {
          throw new Error('net_refused');
        },
        onChange: () => undefined,
        log: (k, t) => write(k, t, i),
      });
      let page: MountedPage;
      try {
        page = await openPage({
          container: box,
          title: tr(`Extension isolée : ${docName}`, `Isolated extension: ${docName}`),
          grants,
          services: grants.storage || grants.picker || grants.network ? services : undefined,
          collab: isCollab
            ? {
                send: (u) => {
                  room.current.push(u.slice());
                  pages.current.forEach((p, j) => {
                    if (j !== i) p.bridge.pushCollabUpdate(u);
                  });
                },
                seeded: () => {
                  write('info', tr('salle semée', 'room seeded'), i);
                  seeded();
                },
              }
            : undefined,
          onDirty: (d) => {
            setDirty(d);
            write('in', `dirty → ${d}`, i);
          },
          saveBytes: async (b) => {
            if (readOnly || m === 'widget') throw new Error('read_only');
            if (savingRef.current) throw new Error('save_in_flight');
            savingRef.current = true;
            try {
              await new Promise((r) => setTimeout(r, 200));
              if (conflictRef.current) {
                write('warn', tr('saveBytes → refusé : item_version_conflict (simulé)', 'saveBytes → refused: item_version_conflict (simulated)'), i);
                throw new Error('item_version_conflict');
              }
              docRef.current = b.slice();
              setDocBytes(docRef.current);
              setSaves((n) => n + 1);
              write('info', `saveBytes · ${formatBytes(b.byteLength, lang)} · ok`, i);
            } finally {
              savingRef.current = false;
            }
          },
          onFatal: (msg) => {
            write('error', `fatal : ${msg}`, i);
            setBanner(tr(`Le plugin isolé a cessé de fonctionner : ${msg}`, `The isolated plugin stopped working: ${msg}`));
          },
          log: (d, t) => write(d, t, i),
        });
      } catch (e) {
        // Un montage remplacé entre-temps (nouvelle construction) n'a plus rien à dire.
        if (mine !== gen.current) return;
        write('error', String(e instanceof Error ? e.message : e), i);
        setBanner(tr('La page bac à sable ne s’est pas chargée.', 'The sandbox page did not load.'));
        return;
      }
      if (mine !== gen.current) {
        page.destroy();
        return;
      }
      pages.current.push(page);
      const editorId = `${manifest.id}-editor`;
      try {
        await initPage(page, {
          mode: m,
          code,
          editorId: m === 'editor' ? editorId : '',
          fileName: docName,
          readOnly: m === 'widget' ? true : readOnly,
          bytes,
          theme: hostTheme(scheme),
          locale: lang,
          ...(isCollab ? { collab: { seed: i === 0 && room.current.length === 0, responsible: i === 0, updates: room.current.map((u) => u.slice()) } } : {}),
        });
        if (mine !== gen.current) return;
        write('info', tr(`monté · ${docName} · ${formatBytes(bytes.byteLength, lang)} reçus`, `mounted · ${docName} · ${formatBytes(bytes.byteLength, lang)} received`), i);
        if (i === 0 && m === 'editor') onProbe?.({ editorId, mounted: true });
        if (isCollab && i === 0) await Promise.race([seededP, new Promise((r) => setTimeout(r, 1500))]);
      } catch (e) {
        if (mine !== gen.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        write('error', `mount-error : ${msg}`, i);
        setBanner(tr(`Montage refusé : ${msg}`, `Mount refused: ${msg}`));
        if (i === 0 && m === 'editor') onProbe?.({ editorId, mounted: false, error: msg });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, manifest, mode, collab, readOnly, docName, lang, tr, write, samples, onProbe]);

  // Recharger à chaque construction, et quand on change ce que la page reçoit au montage.
  useEffect(() => {
    void mountAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey, code, mode, collab, readOnly, sampleName, lang]);
  useEffect(() => () => destroyAll(), []);

  // Le thème est POUSSÉ, comme Filarr le fait quand l'application change de thème.
  useEffect(() => {
    for (const p of pages.current) p.bridge.pushTheme(hostTheme(scheme));
  }, [scheme]);

  const chooseSample = (name: string) => {
    setSampleName(name);
    const b = name === NEW_DOC ? new Uint8Array() : (samples.find((s) => s.name === name)?.bytes ?? new Uint8Array());
    docRef.current = b;
    setDocBytes(b);
    setSaves(0);
  };

  const runFunction = async (fn: SandboxFunctionName, to?: ExportTarget) => {
    if (!code || !manifest) return;
    const holder = document.createElement('div');
    document.body.append(holder);
    let page: MountedPage | null = null;
    try {
      page = await openPage({ container: holder, title: 'fonctions', hidden: true, grants: caps, onDirty: () => undefined, saveBytes: async () => undefined, onFatal: (m) => write('error', `fonctions : ${m}`), log: (d, t) => write(d, t) });
      await initPage(page, { mode: 'function', code, editorId: '', fileName: docName, readOnly: true, bytes: new Uint8Array(), theme: hostTheme(scheme), locale: lang });
      const raw = await page.bridge.call({ fn, fileName: docName, bytes: docRef.current, ...(to ? { to } : {}) });
      const value = readCallValue(fn, raw, caps.functions?.fields ?? []);
      if (value === null) setFnResult(tr(`${fn} : valeur REFUSÉE par l’hôte (mauvaise forme ou hors bornes)`, `${fn}: value REFUSED by the host (wrong shape or out of bounds)`));
      else if (value instanceof Uint8Array) setFnResult(`${fn}${to ? ` → ${to}` : ''} · ${formatBytes(value.byteLength, lang)}\n${preview(value, 1500)}`);
      else setFnResult(`${fn} →\n${typeof value === 'string' ? value.slice(0, 1500) : JSON.stringify(value, null, 2)}`);
    } catch (e) {
      setFnResult(`${fn} : ${tr('échec', 'failed')} (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      page?.destroy();
      holder.remove();
    }
  };

  const saveNow = async () => {
    const p = pages.current[0];
    if (!p) return;
    try {
      const b = await p.bridge.requestBytes();
      if (conflict) {
        setConflict(false);
        write('warn', tr('conflit levé : écrasement délibéré', 'conflict cleared: deliberate overwrite'));
      }
      docRef.current = b;
      setDocBytes(b);
      setSaves((n) => n + 1);
      write('info', `getBytes · ${formatBytes(b.byteLength, lang)}`);
    } catch (e) {
      write('error', `getBytes : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const fns = caps.functions;
  return (
    <section className={compact ? 'preview-page' : 'sim'} aria-labelledby={compact ? undefined : 'sim-t'} aria-label={compact ? tr('Aperçu en direct', 'Live preview') : undefined}>
      {!compact ? (
        <div className="sim-bar">
          <h2 id="sim-t">{title ?? tr('Simulateur Filarr', 'Filarr simulator')}</h2>
          {!schemeProp ? (
            <div className="seg" role="group" aria-label={tr('Thème', 'Theme')}>
              <button type="button" aria-pressed={scheme === 'light'} onClick={() => setScheme('light')}>{tr('Clair', 'Light')}</button>
              <button type="button" aria-pressed={scheme === 'dark'} onClick={() => setScheme('dark')}>{tr('Sombre', 'Dark')}</button>
            </div>
          ) : null}
          <button type="button" className="toggle" aria-pressed={readOnly} onClick={() => setReadOnly((v) => !v)}>{tr('Lecture seule', 'Read-only')}</button>
          <button type="button" className="toggle" aria-pressed={conflict} onClick={() => setConflict((v) => !v)} title={tr('saveBytes rejette item_version_conflict tant que c’est actif', 'saveBytes rejects item_version_conflict while active')}>
            {tr('Simuler un conflit', 'Simulate a conflict')}
          </button>
        </div>
      ) : null}
      <div className={compact ? 'stack' : 'sim-body'} style={compact ? { ['--gap' as string]: '8px' } : undefined}>
        <div className="sim-meta">
          <label className="sr-only" htmlFor={`sim-file-${compact ? 'c' : 'm'}`}>{tr('Fichier ouvert', 'Open file')}</label>
          <select id={`sim-file-${compact ? 'c' : 'm'}`} value={sampleName} onChange={(e) => chooseSample(e.target.value)}>
            {samples.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
            <option value={NEW_DOC}>{tr('(document neuf, 0 octet)', '(new document, 0 bytes)')}</option>
          </select>
          <span>
            · {tr('iframe isolée, CSP', 'isolated iframe, CSP')} <span className="mono">default-src 'none'</span>
          </span>
          {dirty ? <span>· {tr('modifié', 'edited')}</span> : null}
          {saves ? <span>· {tr(`${saves} enregistrement${saves > 1 ? 's' : ''}`, `${saves} save${saves > 1 ? 's' : ''}`)}</span> : null}
          {compact ? (
            <>
              <button type="button" className="toggle" aria-pressed={readOnly} onClick={() => setReadOnly((v) => !v)}>{tr('Lecture seule', 'Read-only')}</button>
            </>
          ) : null}
          {!compact && (caps.noteBlock || caps.homeWidget) ? (
            <select aria-label={tr('Point d’entrée', 'Entry point')} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="editor">{tr('Éditeur', 'Editor')}</option>
              {caps.noteBlock ? <option value="block">{tr('Bloc de note', 'Note block')}</option> : null}
              {caps.homeWidget ? <option value="widget">{tr('Widget d’accueil', 'Home widget')}</option> : null}
            </select>
          ) : null}
          {!compact && caps.collab ? (
            <button type="button" className="toggle" aria-pressed={collab} onClick={() => setCollab((v) => !v)}>{tr('Co-édition (2 pairs)', 'Co-editing (2 peers)')}</button>
          ) : null}
        </div>
        {banner ? <div className="banner banner-err" role="alert">{banner}</div> : null}
        {conflict && !compact ? <div className="banner banner-warn">{tr('Conflit simulé : le prochain enregistrement automatique sera refusé (item_version_conflict). « Enregistrer » écrase.', 'Simulated conflict: the next autosave will be refused (item_version_conflict). “Save” overwrites.')}</div> : null}
        {!code ? <p className="empty">{tr('Pas encore de bundle à monter : la construction doit réussir d’abord.', 'No bundle to mount yet: the build must succeed first.')}</p> : null}
        <div ref={stageRef} className={compact ? 'preview-frame' : 'sim-stage'} />
        {!compact ? (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => void saveNow()} disabled={!code}>{tr('Enregistrer (getBytes)', 'Save (getBytes)')}</button>
            <button type="button" className="btn btn-sm" onClick={() => void mountAll()} disabled={!code}>{tr('Recharger', 'Reload')}</button>
            <button type="button" className="btn btn-sm" onClick={() => chooseSample(sampleName)} disabled={!code}>{tr('Rouvrir le fichier', 'Reopen the file')}</button>
            <span className="hint" style={{ fontSize: 12 }}>{tr(`document : ${formatBytes(docBytes.byteLength, lang)}`, `document: ${formatBytes(docBytes.byteLength, lang)}`)}</span>
          </div>
        ) : null}
        {!compact && fns ? (
          <div className="stack" style={{ ['--gap' as string]: '6px' }}>
            <div className="sim-fns">
              <span className="hint" style={{ fontSize: 12 }}>{tr('Fonctions pures, dans une page sans API :', 'Pure functions, in a page without API:')}</span>
              {fns.extractText ? <button type="button" className="btn btn-sm" onClick={() => void runFunction('extractText')}>extractText</button> : null}
              {fns.thumbnail ? <button type="button" className="btn btn-sm" onClick={() => void runFunction('thumbnail')}>thumbnail</button> : null}
              {fns.fields ? <button type="button" className="btn btn-sm" onClick={() => void runFunction('fields')}>fields</button> : null}
              {(fns.exports ?? []).map((e) => (
                <button key={e.to} type="button" className="btn btn-sm" onClick={() => void runFunction('export', e.to)}>export {e.to}</button>
              ))}
            </div>
            {fnResult ? <pre className="sim-result">{fnResult}</pre> : null}
          </div>
        ) : null}
      </div>
      {!compact ? (
        <div className="sim-log" aria-live="off">
          <span className="sim-log-title">
            {tr('Échanges avec l’hôte', 'Exchanges with the host')}
            <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={() => setLog([])}>{tr('Effacer', 'Clear')}</button>
          </span>
          {log.slice(0, 120).map((l) => (
            <span key={l.id} className="l">
              <span className="t">{l.t}</span>
              <span className={l.dir}>{l.text}</span>
            </span>
          ))}
        </div>
      ) : null}
      <Modal
        open={pick !== null}
        onClose={() => {
          pick?.resolve(null);
          setPick(null);
        }}
        title={tr(`Le sélecteur de Filarr — ${pick?.access === 'readwrite' ? 'lecture et écriture' : 'lecture seule'}`, `Filarr’s picker — ${pick?.access === 'readwrite' ? 'read and write' : 'read only'}`)}
      >
        <p className="hint">{tr('L’extension ne voit que ce que vous choisissez ici (les fichiers d’exemple du projet).', 'The extension only sees what you choose here (the project’s sample files).')}</p>
        <div className="stack" style={{ ['--gap' as string]: '4px' }}>
          {(pick?.names ?? []).map((n) => (
            <label key={n} className="check">
              <input
                type={pick?.multiple ? 'checkbox' : 'radio'}
                name="sim-pick"
                checked={pickSel.includes(n)}
                onChange={(e) => setPickSel((cur) => (pick?.multiple ? (e.target.checked ? [...cur, n] : cur.filter((x) => x !== n)) : [n]))}
              />
              {n}
            </label>
          ))}
          {pick && pick.names.length === 0 ? <p className="empty">{tr('Aucun fichier d’exemple ne convient.', 'No sample file fits.')}</p> : null}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => { pick?.resolve(null); setPick(null); }}>{tr('Annuler', 'Cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => { pick?.resolve(pickSel); setPick(null); }}>{tr('Choisir', 'Choose')}</button>
        </div>
      </Modal>
    </section>
  );
}

/**
 * Ce que l'outil apprend par l'exécution à blanc, appris dans la vraie page :
 * chaque fonction déclarée au manifeste répond-elle ? Pour le Publier.
 */
export async function probeFunctions(code: string, manifest: ExtensionManifest, sample: Sample | null): Promise<{ name: string; ok: boolean; error?: string }[]> {
  const v = readExtensionCapabilities(manifest.capabilities ?? {}, manifest.extensions ?? []);
  const fns = v.ok ? v.capabilities.functions : undefined;
  if (!v.ok || !fns) return [];
  const wanted: { fn: SandboxFunctionName; to?: ExportTarget; label: string }[] = [];
  if (fns.extractText) wanted.push({ fn: 'extractText', label: 'extractText' });
  if (fns.thumbnail) wanted.push({ fn: 'thumbnail', label: 'thumbnail' });
  if (fns.fields) wanted.push({ fn: 'fields', label: 'fields' });
  for (const e of fns.exports ?? []) wanted.push({ fn: 'export', to: e.to, label: `export ${e.to}` });
  const out: { name: string; ok: boolean; error?: string }[] = [];
  const fileName = sample?.name ?? `nouveau.${manifest.extensions[0]}`;
  for (const w of wanted) {
    const holder = document.createElement('div');
    document.body.append(holder);
    let page: MountedPage | null = null;
    try {
      page = await openPage({ container: holder, title: 'sonde', hidden: true, grants: v.capabilities, onDirty: () => undefined, saveBytes: async () => undefined, onFatal: () => undefined, log: () => undefined });
      await initPage(page, { mode: 'function', code, editorId: '', fileName, readOnly: true, bytes: new Uint8Array(), theme: hostTheme('light'), locale: 'fr' });
      const raw = await page.bridge.call({ fn: w.fn, fileName, bytes: sample?.bytes.slice() ?? new Uint8Array(), ...(w.to ? { to: w.to } : {}) });
      const value = readCallValue(w.fn, raw, fns.fields ?? []);
      out.push(value === null ? { name: w.label, ok: false, error: 'valeur refusée par l’hôte (readCallValue)' } : { name: w.label, ok: true });
    } catch (e) {
      out.push({ name: w.label, ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      page?.destroy();
      holder.remove();
    }
  }
  return out;
}

/** Le montage de l'éditeur, à blanc, dans une page cachée : ce que l'outil vérifie par `vm`. */
export async function probeEditor(code: string, manifest: ExtensionManifest, sample: Sample | null): Promise<SandboxProbe> {
  const v = readExtensionCapabilities(manifest.capabilities ?? {}, manifest.extensions ?? []);
  const editorId = `${manifest.id}-editor`;
  const holder = document.createElement('div');
  document.body.append(holder);
  let page: MountedPage | null = null;
  try {
    page = await openPage({ container: holder, title: 'sonde', hidden: true, grants: v.ok ? v.capabilities : {}, onDirty: () => undefined, saveBytes: async () => undefined, onFatal: () => undefined, log: () => undefined });
    await initPage(page, { mode: 'editor', code, editorId, fileName: sample?.name ?? `nouveau.${manifest.extensions[0]}`, readOnly: true, bytes: sample?.bytes.slice() ?? new Uint8Array(), theme: hostTheme('light'), locale: 'fr' });
    return { editorId, mounted: true };
  } catch (e) {
    return { editorId, mounted: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    page?.destroy();
    holder.remove();
  }
}
