/**
 * Code et essai (maquette « Main ») : les étapes et l'arbre des fichiers, des
 * onglets et l'éditeur, les contrôles avant publication, et le simulateur,
 * rechargé à chaque construction.
 */

import { useMemo, useRef, useState } from 'react';
import { CodeEditor } from '../components/CodeEditor';
import { ChecksPanel } from '../components/ChecksPanel';
import { download, Modal, stepsFor } from '../components/chrome';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { formatBytes, isTextFile, strictText, utf8 } from '../lib/bytes';
import { BUILDER_FILE, normalizePath, PROJECT_FILE, sampleFiles } from '../lib/project';
import { Simulator } from '../sim/Simulator';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { href } from '../state/router';

function entryOf(files: Record<string, Uint8Array>, mode: string, build: { kind: string; entry?: string; config?: string } | undefined): string {
  if (build?.kind === 'code' && build.entry && files[build.entry]) return build.entry;
  if (build?.kind === 'nocode' && build.config && files[build.config]) return build.config;
  return mode === 'nocode' ? 'nocode.json' : PROJECT_FILE;
}

export function Workshop() {
  const { tr, lang } = usePrefs();
  const { key, files, setFiles, project, projectError, mode, build, rebuild, setProbe, check } = useProject();
  const first = entryOf(files, mode, project?.build as never);
  const [open, setOpen] = useState<string[]>([first]);
  const [active, setActive] = useState(first);
  const [newFile, setNewFile] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const samplesDir = project?.samples ?? 'exemples';
  const samples = useMemo(() => sampleFiles(files, samplesDir).map((s) => ({ name: s.name, bytes: files[s.path] })), [files, samplesDir]);

  // L'arbre : les dossiers d'abord (src/ en tête), puis les fichiers du projet.
  const tree = useMemo(() => {
    const paths = Object.keys(files).filter((p) => p !== BUILDER_FILE).sort();
    const dirs = new Map<string, string[]>();
    const rootFiles: string[] = [];
    for (const p of paths) {
      const i = p.indexOf('/');
      if (i < 0) rootFiles.push(p);
      else {
        const d = p.slice(0, i);
        if (!dirs.has(d)) dirs.set(d, []);
        dirs.get(d)!.push(p);
      }
    }
    const order = [...dirs.keys()].sort((a, b) => (a === 'src' ? -1 : b === 'src' ? 1 : a.localeCompare(b)));
    return { dirs: order.map((d) => [d, dirs.get(d)!] as const), rootFiles };
  }, [files]);

  const openFile = (p: string) => {
    setOpen((o) => (o.includes(p) ? o : [...o, p]));
    setActive(p);
  };
  const closeFile = (p: string) => {
    const rest = open.filter((x) => x !== p);
    setOpen(rest.length ? rest : [first]);
    if (active === p) setActive(rest[rest.length - 1] ?? first);
  };
  const activeBytes = files[active];
  const activeText = activeBytes && isTextFile(active, activeBytes) ? strictText(activeBytes) : null;

  const createFile = (raw: string) => {
    const p = normalizePath(raw);
    if (!p || files[p]) {
      setErr(tr(`Chemin refusé ou déjà pris : « ${raw} »`, `Path refused or already taken: “${raw}”`));
      return;
    }
    setErr(null);
    setFiles((f) => ({ ...f, [p]: utf8('') }));
    openFile(p);
    setNewFile(null);
  };
  const renameFile = (from: string, raw: string) => {
    const p = normalizePath(raw);
    if (!p || (files[p] && p !== from)) {
      setErr(tr(`Chemin refusé ou déjà pris : « ${raw} »`, `Path refused or already taken: “${raw}”`));
      return;
    }
    setErr(null);
    setFiles((f) => {
      const next = { ...f, [p]: f[from] };
      if (p !== from) delete next[from];
      return next;
    });
    setOpen((o) => o.map((x) => (x === from ? p : x)));
    if (active === from) setActive(p);
    setRename(null);
  };
  const deleteFile = (p: string) => {
    setFiles((f) => {
      const next = { ...f };
      delete next[p];
      return next;
    });
    closeFile(p);
    setConfirmDel(null);
  };

  const steps = stepsFor(mode, tr);
  const current = 'essai';
  const fileButton = (p: string, nested: boolean) => (
    <button key={p} type="button" className={`file${nested ? ' nested' : ''}`} aria-current={active === p ? 'true' : undefined} onClick={() => openFile(p)} title={p}>
      {nested ? p.slice(p.indexOf('/') + 1) : p}
    </button>
  );
  const done = (s: string) => {
    const errs = check.report.lines.filter((l) => l.level === 'error');
    if (s === 'modele' || s === 'donnees') return true;
    if (s === 'vue') return mode === 'nocode' && !errs.some((l) => l.field === 'nocode.json');
    if (s === 'fiche') return !errs.some((l) => /^(manifest|listing|screenshot)/.test(l.field ?? l.code));
    return false;
  };

  return (
    <div className="app" style={{ height: '100vh' }}>
      <Skip />
      <ProjectHeader screen="essai" workshop />
      {projectError ? <div className="banner banner-err" role="alert" style={{ margin: 12 }}>{PROJECT_FILE} : {projectError}</div> : null}
      <div className="workbench" id="contenu">
        <nav aria-label={tr('Projet', 'Project')} className="rail">
          <div className="steps-rail">
            <span className="rail-title">{tr('Étapes', 'Steps')}</span>
            {steps.map((s, i) => {
              const isNow = s.screen === current;
              const ok = !isNow && done(s.screen);
              return (
                <a key={s.screen} href={href(key, s.screen)} aria-current={isNow ? 'page' : undefined}>
                  <span className={`dot${isNow ? ' dot-now' : ok ? ' dot-done' : ''}`} aria-hidden="true">{ok ? '✓' : i + 1}</span>
                  {s.label}
                  {ok ? <span className="sr-only"> ({tr('fait', 'done')})</span> : null}
                </a>
              );
            })}
          </div>
          <div className="files">
            <span className="rail-title" style={{ fontFamily: 'var(--font)' }}>
              {tr('Fichiers', 'Files')}
              <span className="row" style={{ gap: 2 }}>
                <button type="button" className="icon-btn" aria-label={tr('Nouveau fichier', 'New file')} title={tr('Nouveau fichier', 'New file')} onClick={() => setNewFile('src/')}>+</button>
                <button type="button" className="icon-btn" aria-label={tr('Ajouter un fichier d’exemple', 'Add a sample file')} title={tr('Ajouter un fichier d’exemple', 'Add a sample file')} onClick={() => upload.current?.click()}>⇪</button>
              </span>
            </span>
            {newFile !== null ? (
              <form className="row" style={{ gap: 4, padding: '0 4px 6px' }} onSubmit={(e) => { e.preventDefault(); createFile(newFile); }}>
                <input className="input input-sm mono" aria-label={tr('Chemin du nouveau fichier', 'New file path')} autoFocus value={newFile} onChange={(e) => setNewFile(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewFile(null)} />
              </form>
            ) : null}
            {tree.dirs.map(([d, ps]) => (
              <div key={d} className="stack" style={{ ['--gap' as string]: '1px' }}>
                <span className="dir">{d}/</span>
                {ps.map((p) => fileButton(p, true))}
              </div>
            ))}
            {tree.rootFiles.map((p) => fileButton(p, false))}
            <input
              ref={upload}
              type="file"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const name = normalizePath(f.name.split(/[\\/]/).pop() ?? '');
                if (!name || f.size > 64 * 1024 * 1024) return setErr(tr('Fichier refusé.', 'File refused.'));
                const bytes = new Uint8Array(await f.arrayBuffer());
                setFiles((fs) => ({ ...fs, [`${samplesDir}/${name}`]: bytes }));
              }}
            />
          </div>
        </nav>

        <div className="center">
          <div role="tablist" aria-label={tr('Fichiers ouverts', 'Open files')} className="tabs">
            {open.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={active === p} onClick={() => setActive(p)} onAuxClick={() => closeFile(p)}>
                {p.split('/').pop()}
                {open.length > 1 ? (
                  <span role="button" tabIndex={0} aria-label={tr(`Fermer ${p}`, `Close ${p}`)} onClick={(e) => { e.stopPropagation(); closeFile(p); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeFile(p); } }} style={{ opacity: 0.6 }}>×</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--faint)' }}>
            <span className="mono">{active}</span>
            {activeBytes ? <span>· {formatBytes(activeBytes.byteLength, lang)}</span> : null}
            <span style={{ marginLeft: 'auto' }} />
            {activeBytes && active !== PROJECT_FILE ? (
              <>
                <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={() => setRename(active)}>{tr('Renommer', 'Rename')}</button>
                <button type="button" className="link-btn" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => setConfirmDel(active)}>{tr('Supprimer', 'Delete')}</button>
              </>
            ) : null}
          </div>
          {err ? <div className="banner banner-err" role="alert" style={{ margin: 8 }}>{err}</div> : null}
          {rename ? (
            <form className="row" style={{ gap: 6, padding: 8 }} onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('p'); renameFile(rename, String(v)); }}>
              <input name="p" className="input input-sm mono" style={{ flex: 1 }} aria-label={tr('Nouveau chemin', 'New path')} defaultValue={rename} autoFocus />
              <button type="submit" className="btn btn-sm">{tr('Renommer', 'Rename')}</button>
              <button type="button" className="btn btn-sm" onClick={() => setRename(null)}>{tr('Annuler', 'Cancel')}</button>
            </form>
          ) : null}
          {!activeBytes ? (
            <div className="binary">{tr('Ce fichier n’existe plus.', 'This file no longer exists.')}</div>
          ) : activeText === null ? (
            <div className="binary">
              <span>{tr(`Fichier binaire (${formatBytes(activeBytes.byteLength, lang)}) : il ne se modifie pas ici.`, `Binary file (${formatBytes(activeBytes.byteLength, lang)}): it cannot be edited here.`)}</span>
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => download(activeBytes, active.split('/').pop() ?? 'fichier')}>{tr('Télécharger', 'Download')}</button>
            </div>
          ) : (
            <CodeEditor key={active} path={active} value={activeText} label={tr(`Contenu de ${active}`, `Content of ${active}`)} onSave={rebuild} onChange={(v) => setFiles((f) => ({ ...f, [active]: utf8(v) }))} />
          )}
          <ChecksPanel />
        </div>

        <Simulator code={build?.ok ? (build.code ?? null) : null} buildKey={build?.at ?? 0} manifest={check.manifest ?? null} samples={samples} onProbe={setProbe} />
      </div>
      <Modal open={confirmDel !== null} onClose={() => setConfirmDel(null)} title={tr('Supprimer ce fichier ?', 'Delete this file?')}>
        <p className="mono">{confirmDel}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => setConfirmDel(null)}>{tr('Annuler', 'Cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => confirmDel && deleteFile(confirmDel)}>{tr('Supprimer', 'Delete')}</button>
        </div>
      </Modal>
    </div>
  );
}
