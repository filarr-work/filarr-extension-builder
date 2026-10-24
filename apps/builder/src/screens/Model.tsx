/**
 * Le modèle (étape « Modèle » des extensions avec code) : l'identité du projet
 * — nom, identifiant définitif, types de fichiers, point d'entrée — et le
 * modèle de départ dont il vient.
 */

import { SLUG_RE } from '@filarr/extension-api';
import { ChipsInput } from '../components/ChipsInput';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { treeLines } from '../lib/templates';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { go, href } from '../state/router';

export function ModelScreen() {
  const { tr } = usePrefs();
  const { key, files, project, updateProject, meta } = useProject();
  if (!project) {
    return (
      <div className="app">
        <ProjectHeader screen="modele" />
        <main className="page"><p className="banner banner-err">{tr('filarr.extension.json est illisible : corrigez-le dans l’atelier.', 'filarr.extension.json is unreadable: fix it in the workshop.')}</p></main>
      </div>
    );
  }
  const m = project.manifest;
  const id = String(m.id ?? '');
  const entries = Object.keys(files).filter((p) => /^src\/.*\.(ts|tsx|js|jsx|mjs)$/.test(p) && !p.endsWith('.d.ts'));
  const entry = project.build.kind === 'code' ? project.build.entry : '';
  const setManifest = (patch: Record<string, unknown>) =>
    updateProject((raw) => {
      Object.assign(raw.manifest as Record<string, unknown>, patch);
    });
  const template = meta.template ?? '';
  return (
    <div className="app">
      <Skip />
      <ProjectHeader screen="modele" />
      <main id="contenu" className="page">
        <div className="stack" style={{ ['--gap' as string]: '8px', maxWidth: 680 }}>
          <h1>{tr('Le modèle', 'The template')}</h1>
          <p className="lead">{tr('L’identité de l’extension : ce que Filarr ouvre avec, et sous quel identifiant. Le reste est dans la fiche.', 'The extension’s identity: what Filarr opens with it, and under which identifier. The rest is in the listing.')}</p>
        </div>
        <div className="split">
          <form className="main" onSubmit={(e) => e.preventDefault()}>
            <div className="grid-auto">
              <div className="field">
                <label htmlFor="m-name">{tr('Nom', 'Name')}</label>
                <input id="m-name" className="input" value={String(m.name ?? '')} maxLength={100} onChange={(e) => setManifest({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="m-id">{tr('Identifiant', 'Identifier')}</label>
                <input id="m-id" className="input mono" value={id} spellCheck={false} aria-invalid={!SLUG_RE.test(id)} aria-describedby="m-id-h" onChange={(e) => setManifest({ id: e.target.value.toLowerCase() })} />
                <span id="m-id-h" className={SLUG_RE.test(id) ? 'hint' : 'err'}>
                  {tr(`Définitif une fois publié. L’éditeur doit être posé sous « ${id}-editor » : defineExtension le fait pour vous.`, `Final once published. The editor must be registered as “${id}-editor”: defineExtension does it for you.`)}
                </span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="m-ext">{tr('Types de fichiers ouverts', 'File types opened')}</label>
              <ChipsInput id="m-ext" value={m.extensions ?? []} onChange={(exts) => setManifest({ extensions: exts })} />
            </div>
            <div className="field">
              <label htmlFor="m-entry">{tr('Point d’entrée', 'Entry point')}</label>
              <select id="m-entry" className="select mono" value={entry} onChange={(e) => updateProject((raw) => { raw.build = { kind: 'code', entry: e.target.value }; })}>
                {!entries.includes(entry) ? <option value={entry}>{entry}</option> : null}
                {entries.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className="hint">{tr('Construit en IIFE, ES2020, comme filarr-ext build ; un import « ./x.worker.ts?worker » devient le texte d’un worker.', 'Built as IIFE, ES2020, like filarr-ext build; an import “./x.worker.ts?worker” becomes a worker’s text.')}</span>
            </div>
            {template ? <p className="hint">{tr(`Créé depuis le modèle « ${template.replace(/^exemple:(code|nocode):/, 'exemple ')} ».`, `Created from the “${template.replace(/^exemple:(code|nocode):/, 'example ')}” template.`)}</p> : null}
            <div className="row">
              <button type="button" className="btn btn-primary btn-md" onClick={() => go(href(key, 'fiche'))}>{tr('Suivant : la fiche', 'Next: the listing')}</button>
            </div>
          </form>
          <aside className="side">
            <section className="card">
              <h2>{tr('Le projet', 'The project')}</h2>
              <pre className="tree">{treeLines(id || 'extension', Object.keys(files)).join('\n')}</pre>
              <p className="hint" style={{ margin: 0 }}>{tr('Le même projet s’ouvre dans votre éditeur habituel : rien ne dépend du Builder.', 'The same project opens in your usual editor: nothing depends on the Builder.')}</p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
