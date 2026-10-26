/**
 * Nouvelle extension — maquette « Nouveau » : sans code ou avec du code, nom,
 * identifiant définitif, types de fichiers, modèle de départ (dont les
 * exemples du dépôt), langage ; importer un projet .zip ; et les projets déjà
 * enregistrés dans ce navigateur.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SLUG_RE } from '@filarr/extension-api';
import { ChipsInput } from '../components/ChipsInput';
import { download, Modal, TopBar } from '../components/chrome';
import { text } from '../lib/bytes';
import { PROJECT_FILE, slugify, tryParseProject } from '../lib/project';
import { deleteProject, listProjects, newKey, saveProject, type StoredProject } from '../lib/store';
import { BASE_TEMPLATES, createProjectFiles, exampleTemplates, treeLines, type Mode, type TemplateInfo } from '../lib/templates';
import { exportProjectZip, importProjectZip } from '../lib/zip';
import { usePrefs } from '../state/prefs';
import { go, href } from '../state/router';

const GridIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="5" rx="2" />
    <rect x="13" y="10" width="8" height="11" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
  </svg>
);
const CodeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 7l-5 5 5 5" />
    <path d="M16 7l5 5-5 5" />
    <path d="M14 4l-4 16" />
  </svg>
);

function Tile({ t, on, pick }: { t: TemplateInfo; on: boolean; pick(): void }) {
  const { lang } = usePrefs();
  return (
    <button type="button" className="tile" aria-pressed={on} onClick={pick}>
      <span aria-hidden="true" className="tile-thumb">
        <span style={{ width: t.bars[0] }} />
        <span style={{ width: t.bars[1], background: t.accent }} />
        <span style={{ width: t.bars[2] }} />
      </span>
      <span className="tile-name">
        {t.example?.icon ? <span aria-hidden="true">{t.example.icon}</span> : null}
        {t.name[lang]}
      </span>
      <span className="tile-desc">{t.desc[lang]}</span>
    </button>
  );
}

export function NewExtension() {
  const { tr, lang } = usePrefs();
  const [mode, setMode] = useState<Mode>('nocode');
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [exts, setExts] = useState<string[]>([]);
  const [template, setTemplate] = useState('nocode-vierge');
  const [langCode, setLangCode] = useState<'ts' | 'js'>('ts');
  const [examples, setExamples] = useState<TemplateInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<string[]>([]);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<StoredProject | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    exampleTemplates().then(setExamples).catch(() => setExamples([]));
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const templates = useMemo(() => BASE_TEMPLATES.filter((t) => t.mode === mode), [mode]);
  const exampleList = useMemo(() => examples.filter((t) => t.mode === mode), [examples, mode]);
  const chosen = [...templates, ...exampleList].find((t) => t.id === template);
  const effectiveId = idTouched ? id : slugify(name || (mode === 'nocode' ? 'mon-extension' : 'mon-editeur'));
  const idOk = SLUG_RE.test(effectiveId);
  const extsOk = exts.length >= 1 && exts.length <= 10;
  const nameOk = name.trim().length >= 1 && name.length <= 100;

  const pickMode = (m: Mode) => {
    setMode(m);
    setTemplate(m === 'nocode' ? 'nocode-vierge' : 'texte');
  };
  const pickTemplate = (t: TemplateInfo) => {
    setTemplate(t.id);
    if (t.example) {
      // Un exemple impose ce qu'il ouvre : on préremplit, l'auteur peut encore changer.
      setName(t.example.name);
      setId(t.example.id);
      setIdTouched(true);
      setExts(t.example.extensions);
    }
  };

  // « Le projet créé » : l'arborescence réelle de ce qui sera créé.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      createProjectFiles({ mode, name: name || 'Mon extension', id: idOk ? effectiveId : 'mon-extension', extensions: exts.length ? exts : ['ext'], template, lang: langCode })
        .then((files) => alive && setTree(treeLines(idOk ? effectiveId : 'mon-extension', Object.keys(files))))
        .catch(() => alive && setTree([]));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mode, name, effectiveId, idOk, exts, template, langCode]);

  const create = async () => {
    setError(null);
    if (!nameOk || !idOk || !extsOk) {
      setError(tr('Complétez le nom, l’identifiant et au moins un type de fichier.', 'Fill in the name, the identifier and at least one file type.'));
      return;
    }
    setBusy(true);
    try {
      const files = await createProjectFiles({ mode, name: name.trim(), id: effectiveId, extensions: exts, template, lang: langCode });
      const key = newKey();
      const now = Date.now();
      await saveProject({ key, createdAt: now, updatedAt: now, files });
      go(href(key, mode === 'nocode' && !template.startsWith('exemple:') ? 'donnees' : mode === 'nocode' ? 'vue' : 'essai'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importZip = async (file: File) => {
    setError(null);
    try {
      const { files } = importProjectZip(new Uint8Array(await file.arrayBuffer()));
      const key = newKey();
      const now = Date.now();
      await saveProject({ key, createdAt: now, updatedAt: now, files });
      const p = tryParseProject(files);
      go(href(key, p.ok && p.project.build.kind === 'nocode' ? 'vue' : 'essai'));
    } catch (e) {
      setError(tr(`Import refusé : ${e instanceof Error ? e.message : String(e)}`, `Import refused: ${e instanceof Error ? e.message : String(e)}`));
    }
  };

  const describe = (p: StoredProject) => {
    const parsed = tryParseProject(p.files);
    if (!parsed.ok) return { id: p.key, name: tr('Projet illisible', 'Unreadable project'), info: parsed.error.message };
    const m = parsed.project.manifest;
    return { id: m.id, name: m.name, info: `${m.id} · ${m.version} · ${parsed.project.build.kind === 'nocode' ? tr('sans code', 'no code') : tr('avec code', 'with code')}`, kind: parsed.project.build.kind };
  };

  return (
    <div className="app">
      <a className="skip" href="#contenu">
        {tr('Aller au contenu', 'Skip to content')}
      </a>
      <TopBar end={<a href="#guide" style={{ textDecoration: 'none', fontSize: 13 }}>{tr('Guide', 'Guide')}</a>} />
      <main id="contenu" className="page">
        <div className="stack" style={{ ['--gap' as string]: '8px', maxWidth: 680 }}>
          <h1>{tr('Nouvelle extension', 'New extension')}</h1>
          <p className="lead">
            {tr(
              'Un éditeur pour un type de fichier que Filarr n’ouvre pas encore. Tout reste dans ce navigateur jusqu’à ce que vous exportiez ou publiiez.',
              'An editor for a file type Filarr does not open yet. Everything stays in this browser until you export or publish.'
            )}
          </p>
        </div>

        <div role="group" aria-label={tr('Façon de construire', 'How to build')} className="grid-auto" style={{ ['--min' as string]: '340px' }}>
          <button type="button" className="choice" aria-pressed={mode === 'nocode'} onClick={() => pickMode('nocode')}>
            <span className="choice-icon"><GridIcon /></span>
            <span className="stack" style={{ ['--gap' as string]: '6px' }}>
              <span style={{ fontSize: 17, fontWeight: 650 }}>{tr('Sans code', 'No code')}</span>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>
                {tr('Décrivez votre fichier, posez des blocs, réglez le style. Pour les formats de données : JSON, CSV, texte ligne à ligne, clé : valeur.', 'Describe your file, place blocks, set the style. For data formats: JSON, CSV, line-by-line text, key: value.')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: mode === 'nocode' ? 'var(--faint)' : 'var(--accent)' }}>
                {mode === 'nocode' ? tr('Choisi · une extension sans code peut passer en code à tout moment', 'Selected · a no-code extension can switch to code at any time') : tr('Commencer sans code', 'Start without code')}
              </span>
            </span>
          </button>
          <button type="button" className="choice" aria-pressed={mode === 'code'} onClick={() => pickMode('code')}>
            <span className="choice-icon"><CodeIcon /></span>
            <span className="stack" style={{ ['--gap' as string]: '6px' }}>
              <span style={{ fontSize: 17, fontWeight: 650 }}>{tr('Avec du code', 'With code')}</span>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>
                {tr('TypeScript ou JavaScript, la bibliothèque d’interface de votre choix. Pour tout le reste : binaire, dessin, formats complexes.', 'TypeScript or JavaScript, the UI library of your choice. For everything else: binary, drawing, complex formats.')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: mode === 'code' ? 'var(--faint)' : 'var(--accent)' }}>
                {mode === 'code' ? tr('Choisi', 'Selected') : tr('Commencer avec du code', 'Start with code')}
              </span>
            </span>
          </button>
        </div>

        <div className="split">
          <form
            className="main"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="grid-auto">
              <div className="field">
                <label htmlFor="n-name">{tr('Nom', 'Name')}</label>
                <input id="n-name" className="input" type="text" value={name} maxLength={100} placeholder={mode === 'nocode' ? tr('Carnet de recettes', 'Recipe book') : tr('Tracés GPX', 'GPX tracks')} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="n-id">{tr('Identifiant', 'Identifier')}</label>
                <input
                  id="n-id"
                  className="input mono"
                  type="text"
                  value={effectiveId}
                  aria-describedby="n-id-h"
                  aria-invalid={!idOk}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    setIdTouched(true);
                    setId(e.target.value.toLowerCase());
                  }}
                />
                <span id="n-id-h" className={idOk ? 'hint' : 'err'}>
                  {idOk ? tr('Définitif une fois publié. Minuscules, chiffres et tirets.', 'Final once published. Lowercase letters, digits and hyphens.') : tr('Une lettre, puis 1 à 63 minuscules, chiffres ou tirets.', 'A letter, then 1 to 63 lowercase letters, digits or hyphens.')}
                </span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="n-ext">{tr('Types de fichiers ouverts', 'File types opened')}</label>
              <ChipsInput id="n-ext" value={exts} onChange={setExts} describedBy="n-ext-h" />
              <span id="n-ext-h" className="hint">
                {tr('De 1 à 10. Si Filarr ou une extension installée ouvre déjà ce type, Filarr vous le dira à l’installation.', 'From 1 to 10. If Filarr or an installed extension already opens this type, Filarr will tell you at install time.')}
              </span>
            </div>

            <fieldset className="stack">
              <legend>{tr('Modèle de départ', 'Starting template')}</legend>
              <div className="grid-auto" style={{ ['--min' as string]: '200px', ['--gap' as string]: '12px' }}>
                {templates.map((t) => (
                  <Tile key={t.id} t={t} on={template === t.id} pick={() => pickTemplate(t)} />
                ))}
              </div>
              {exampleList.length ? (
                <>
                  <span className="sub-label" style={{ paddingTop: 8 }}>{tr('Ou partir d’un exemple du dépôt', 'Or start from a repository example')}</span>
                  <div className="grid-auto" style={{ ['--min' as string]: '200px', ['--gap' as string]: '12px' }}>
                    {exampleList.map((t) => (
                      <Tile key={t.id} t={t} on={template === t.id} pick={() => pickTemplate(t)} />
                    ))}
                  </div>
                </>
              ) : null}
            </fieldset>

            {mode === 'code' ? (
              <div className="grid-auto" style={{ ['--gap' as string]: '24px' }}>
                <fieldset className="stack" style={{ ['--gap' as string]: '8px' }}>
                  <legend>{tr('Langage', 'Language')}</legend>
                  {chosen?.source === 'example' ? (
                    <span className="hint">{tr('Les exemples sont écrits en TypeScript.', 'Examples are written in TypeScript.')}</span>
                  ) : (
                    <>
                      <label className="radio"><input type="radio" name="lang" checked={langCode === 'ts'} onChange={() => setLangCode('ts')} />TypeScript</label>
                      <label className="radio"><input type="radio" name="lang" checked={langCode === 'js'} onChange={() => setLangCode('js')} />JavaScript</label>
                    </>
                  )}
                </fieldset>
                <fieldset className="stack" style={{ ['--gap' as string]: '8px' }}>
                  <legend>{tr('Interface', 'Interface')}</legend>
                  <label className="radio"><input type="radio" name="ui" checked readOnly />{tr('DOM natif, aucune dépendance', 'Native DOM, no dependency')}</label>
                  <span className="hint">
                    {tr('Preact, Svelte ou Lit : exportez le projet et construisez avec filarr-ext. Le Builder construit sans réseau et n’embarque que @filarr/extension-api, @filarr/nocode-engine et yjs.', 'Preact, Svelte or Lit: export the project and build with filarr-ext. The Builder builds offline and only bundles @filarr/extension-api, @filarr/nocode-engine and yjs.')}
                  </span>
                </fieldset>
              </div>
            ) : null}

            {error ? <div className="banner banner-err" role="alert">{error}</div> : null}
            <div className="row">
              <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                {busy ? tr('Création…', 'Creating…') : tr('Créer le projet', 'Create the project')}
              </button>
              <button type="button" className="btn btn-md" onClick={() => zipInput.current?.click()}>
                {tr('Importer un projet .zip', 'Import a .zip project')}
              </button>
              <input
                ref={zipInput}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importZip(f);
                }}
              />
            </div>
          </form>

          <aside id="guide" className="side">
            <section className="card" aria-labelledby="tree-t">
              <h2 id="tree-t">{tr('Le projet créé', 'The project created')}</h2>
              <pre className="tree">{tree.join('\n')}</pre>
              <p className="hint" style={{ margin: 0 }}>{tr('Le même projet s’ouvre dans votre éditeur habituel : rien ne dépend du Builder.', 'The same project opens in your usual editor: nothing depends on the Builder.')}</p>
            </section>
            <section className="card" aria-labelledby="cli-t">
              <h2 id="cli-t">{tr('Ou dans votre terminal', 'Or in your terminal')}</h2>
              <pre className="term">
                <code>
                  <span className="p">$</span> npm create filarr-extension@latest {effectiveId}{'\n'}
                  <span className="p">$</span> cd {effectiveId} && npm install{'\n'}
                  <span className="p">$</span> npm run dev     <span className="c">{tr('# simulateur', '# simulator')}</span>{'\n'}
                  <span className="p">$</span> npm run check   <span className="c">{tr('# contrôles', '# checks')}</span>{'\n'}
                  <span className="p">$</span> npm run pack    <span className="c"># .filarrext</span>
                </code>
              </pre>
            </section>
            <section className="card" aria-labelledby="safe-t">
              <h2 id="safe-t">{tr('Ce que le Builder ne fait jamais', 'What the Builder never does')}</h2>
              <ul className="checklist">
                <li><span className="sym-ok" aria-hidden="true">✓</span>{tr('demander un mot de passe, un jeton ou une clé Filarr ;', 'ask for a Filarr password, token or key;')}</li>
                <li><span className="sym-ok" aria-hidden="true">✓</span>{tr('appeler un serveur : ni API de Filarr, ni télémétrie, ni CDN ;', 'call a server: no Filarr API, no telemetry, no CDN;')}</li>
                <li><span className="sym-ok" aria-hidden="true">✓</span>{tr('exécuter votre code ailleurs que dans la page bac à sable isolée de Filarr ;', 'run your code anywhere but Filarr’s isolated sandbox page;')}</li>
                <li><span className="sym-ok" aria-hidden="true">✓</span>{tr('signer : la signature se fait dans Filarr, sur votre appareil.', 'sign: signing happens in Filarr, on your device.')}</li>
              </ul>
            </section>
          </aside>
        </div>

        <section aria-labelledby="mine-t" className="stack">
          <h2 id="mine-t" className="section-title">{tr('Vos projets dans ce navigateur', 'Your projects in this browser')}</h2>
          {projects.length === 0 ? (
            <p className="empty">{tr('Aucun pour l’instant. Ils restent ici, et nulle part ailleurs, tant que vous ne les exportez pas.', 'None yet. They stay here, and nowhere else, until you export them.')}</p>
          ) : (
            <ul className="projects">
              {projects.map((p) => {
                const d = describe(p);
                return (
                  <li key={p.key}>
                    <div className="grow">
                      <a href={href(p.key, d.kind === 'nocode' ? 'vue' : 'essai')}>{d.name}</a>
                      <span className="hint mono" style={{ fontSize: 12 }}>
                        {d.info} · {new Date(p.updatedAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                      </span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => download(exportProjectZip(p.files, d.id), `${d.id}.zip`, 'application/zip')}>
                      {tr('Exporter', 'Export')}
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(p)}>
                      {tr('Supprimer', 'Delete')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={tr('Supprimer ce projet ?', 'Delete this project?')}>
        <p className="lead" style={{ fontSize: 14 }}>
          {tr('Il n’existe que dans ce navigateur : exportez-le d’abord si vous voulez le garder. Les versions déjà publiées ne sont pas touchées.', 'It only exists in this browser: export it first if you want to keep it. Versions already published are not affected.')}
        </p>
        <p className="mono" style={{ fontSize: 13 }}>{confirmDelete ? text(confirmDelete.files[PROJECT_FILE]).length > 0 && describe(confirmDelete).info : ''}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>{tr('Annuler', 'Cancel')}</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (!confirmDelete) return;
              await deleteProject(confirmDelete.key);
              setProjects(await listProjects());
              setConfirmDelete(null);
            }}
          >
            {tr('Supprimer', 'Delete')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
