/**
 * Publier (maquette « Publier ») : construire, vérifier, empaqueter le
 * `.filarrext` EXACT de PACKAGE.md, puis le remettre à Filarr — « Ouvrir dans
 * Filarr » (PACKAGE.md §5, chemin web), le fichier à déposer, ou la commande
 * `npx filarr-ext publish`.
 *
 * Le Builder ne signe pas et ne voit jamais la clé : la relecture complète et
 * la signature se font dans Filarr, sur l'appareil de l'auteur.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { download, ReportList, summaryOf } from '../components/chrome';
import { formatBytes } from '../lib/bytes';
import { DEFAULT_FILARR_ORIGIN, normalizeFilarrOrigin, openInFilarr, type Handoff, type HandoffOutcome } from '../lib/handoff';
import { makePackage, type PackResult } from '../lib/pack';
import { sampleFiles } from '../lib/project';
import { getPref, setPref } from '../lib/store';
import { BUILDER_TOOL, ESBUILD_VERSION } from '../lib/version';
import { probeEditor, probeFunctions } from '../sim/Simulator';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { href } from '../state/router';

type StepState = 'todo' | 'now' | 'done' | 'fail';

export function PublishScreen() {
  const { tr, lang } = usePrefs();
  const { key, files, project, build, building, mode, meta, setMeta } = useProject();
  const [pack, setPack] = useState<PackResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [origin, setOrigin] = useState(() => getPref('filarr-origin') ?? DEFAULT_FILARR_ORIGIN);
  const [handoff, setHandoff] = useState<{ state: 'waiting' | HandoffOutcome; at: number } | null>(null);
  const current = useRef<Handoff | null>(null);
  const run = useRef(0);

  const prepare = useCallback(async () => {
    if (!build || !project) return;
    const mine = ++run.current;
    setVerifying(true);
    setPack(null);
    try {
      const samples = sampleFiles(files, project.samples).map((s) => ({ name: s.name, bytes: files[s.path] }));
      const manifest = project.manifest;
      let probe = null;
      if (build.ok && build.code && Array.isArray(manifest.extensions) && manifest.extensions.length) {
        // L'essai réel, dans la page bac à sable : l'éditeur se monte-t-il, les fonctions répondent-elles ?
        probe = { ...(await probeEditor(build.code, manifest, samples[0] ?? null)), functions: await probeFunctions(build.code, manifest, samples[0] ?? null) };
      }
      const engine = (await import('virtual:filarr/engine')).ENGINE_SOURCE;
      const r = await makePackage(files, build, engine, probe);
      if (mine === run.current) setPack(r);
    } finally {
      if (mine === run.current) setVerifying(false);
    }
    // Les fichiers lus au moment du clic suffisent : on re-prépare quand la construction change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, project?.build, files]);

  useEffect(() => {
    if (build && !building) void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, building]);

  useEffect(() => () => current.current?.cancel(), []);

  if (!project) {
    return (
      <div className="app">
        <ProjectHeader screen="publier" />
        <main className="page"><p className="banner banner-err">{tr('filarr.extension.json est illisible.', 'filarr.extension.json is unreadable.')}</p></main>
      </div>
    );
  }
  const m = project.manifest;
  const name = String(m.name ?? m.id);
  const version = String(m.version ?? '');
  const lines = pack?.check.report.lines ?? [];
  const errors = lines.filter((l) => l.level === 'error');
  const bundleBytes = build?.code ? new TextEncoder().encode(build.code).byteLength : 0;
  const buildState: StepState = !build || building ? 'now' : build.ok ? 'done' : 'fail';
  const verifyState: StepState = buildState !== 'done' ? 'todo' : verifying ? 'now' : errors.filter((l) => l.code !== 'pack_refused').length ? 'fail' : 'done';
  const packState: StepState = verifyState !== 'done' ? 'todo' : pack?.ok ? 'done' : verifying ? 'now' : 'fail';
  const originOk = normalizeFilarrOrigin(origin);
  const sum = summaryOf(lines.filter((l) => l.code !== 'pack'), tr);
  const checksCount = lines.filter((l) => l.code !== 'pack' && l.code !== 'pack_refused').length;
  const shots = project.screenshots.length;
  const notes = project.listing?.releaseNotes;

  const startHandoff = () => {
    if (!pack?.bytes || !originOk) return;
    current.current?.cancel();
    // Dans le geste de l'utilisateur : sinon le navigateur bloque la fenêtre.
    const h = openInFilarr(pack.bytes, originOk);
    current.current = h;
    setHandoff({ state: 'waiting', at: Date.now() });
    void h.done.then((state) => setHandoff({ state, at: Date.now() }));
  };

  const step = (n: number, state: StepState, title: string, detail: string) => (
    <li className={state === 'done' ? 'done' : state === 'now' ? 'now' : state === 'fail' ? 'fail' : ''}>
      <span className="h">
        <span className={`dot${state === 'done' ? ' dot-done' : state === 'now' ? ' dot-now' : ''}`} aria-hidden="true" style={state === 'fail' ? { background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'transparent' } : undefined}>
          {state === 'done' ? '✓' : state === 'fail' ? '✗' : n}
        </span>
        {title}
        <span className="sr-only">
          {' '}({state === 'done' ? tr('fait', 'done') : state === 'now' ? tr('en cours', 'in progress') : state === 'fail' ? tr('en échec', 'failed') : tr('à venir', 'to come')})
        </span>
      </span>
      <span className="d" style={n === 3 ? { fontFamily: 'var(--mono)', fontSize: 12 } : undefined}>{detail}</span>
    </li>
  );

  const handoffText = (() => {
    if (!handoff) return null;
    switch (handoff.state) {
      case 'waiting':
        return tr('Filarr s’ouvre dans un nouvel onglet ; le paquet part dès qu’il est prêt (60 s au plus).', 'Filarr opens in a new tab; the package is sent as soon as it is ready (60 s at most).');
      case 'sent':
        return tr('Paquet remis à Filarr. Relisez tout là-bas, puis signez : rien n’est publié sans votre confirmation.', 'Package handed to Filarr. Review everything there, then sign: nothing is published without your confirmation.');
      case 'blocked':
        return tr('La fenêtre n’a pas pu s’ouvrir (bloqueur de fenêtres ?). Autorisez-la, ou téléchargez le paquet.', 'The window could not open (popup blocker?). Allow it, or download the package.');
      case 'timeout':
        return tr('Filarr n’a pas répondu dans les 60 s : rien n’a été envoyé. Réessayez, ou déposez le fichier dans Place de marché → Publier.', 'Filarr did not answer within 60 s: nothing was sent. Try again, or drop the file in Marketplace → Publish.');
      case 'closed':
        return tr('La fenêtre de Filarr a été fermée avant d’être prête : rien n’a été envoyé.', 'Filarr’s window was closed before it was ready: nothing was sent.');
      default:
        return null;
    }
  })();

  return (
    <div className="app">
      <Skip />
      <ProjectHeader screen="publier" />
      <main id="contenu" className="page" style={{ maxWidth: 1160 }}>
        <div className="stack" style={{ ['--gap' as string]: '8px', maxWidth: 720 }}>
          <h1>{tr(`Publier ${name} ${version}`, `Publish ${name} ${version}`)}</h1>
          <p className="lead">
            {tr('Le Builder prépare tout, mais ne signe pas : votre clé ne vit que dans Filarr. La dernière étape se fait donc là-bas, sur votre appareil.', 'The Builder prepares everything, but does not sign: your key only lives in Filarr. The last step therefore happens there, on your device.')}
          </p>
        </div>

        <ol aria-label={tr('Étapes de publication', 'Publishing steps')} className="pipeline">
          {step(1, buildState, tr('Construire', 'Build'), build?.ok ? (mode === 'nocode' ? tr(`moteur sans code ${build.engineVersion} · ${formatBytes(bundleBytes, lang)}`, `no-code engine ${build.engineVersion} · ${formatBytes(bundleBytes, lang)}`) : `IIFE · ES2020 · ${formatBytes(bundleBytes, lang)}`) : build ? tr('la construction échoue : voir les contrôles', 'the build fails: see the checks') : tr('construction…', 'building…'))}
          {step(2, verifyState, tr('Vérifier', 'Check'), verifying ? tr('contrôles et essai dans la page bac à sable…', 'checks and trial in the sandbox page…') : pack ? tr(`${checksCount} contrôles, ceux de filarr-ext check · ${sum.text}`, `${checksCount} checks, those of filarr-ext check · ${sum.text}`) : '—')}
          {step(3, packState, tr('Empaqueter', 'Package'), pack?.ok && pack.fileName ? `${pack.fileName}` : packState === 'fail' ? tr('refusé : corrigez les erreurs', 'refused: fix the errors') : '—')}
          {step(4, pack?.ok ? 'now' : 'todo', tr('Signer dans Filarr', 'Sign in Filarr'), tr('Relecture, puis signature Ed25519', 'Review, then Ed25519 signature'))}
          {step(5, 'todo', tr('En ligne', 'Online'), tr('Visible dans le catalogue', 'Visible in the catalog'))}
        </ol>

        {errors.length || (pack && !pack.ok) ? (
          <section className="checks" style={{ borderRadius: 14, border: '1px solid var(--border)', maxHeight: 'none' }} aria-labelledby="pub-chk">
            <div className="checks-head">
              <h2 id="pub-chk">{tr('À corriger avant de publier', 'To fix before publishing')}</h2>
              <a href={href(key, 'essai')} style={{ fontSize: 12 }}>{tr('Ouvrir l’atelier', 'Open the workshop')}</a>
            </div>
            <ReportList lines={lines} onlyProblems />
          </section>
        ) : null}

        <div className="split">
          <section aria-labelledby="how-t" className="main" style={{ gap: 16 }}>
            <h2 id="how-t" className="section-title">{tr('Envoyer à Filarr', 'Send to Filarr')}</h2>
            <article className="way rec">
              <div className="txt">
                <span className="t">{tr('Ouvrir dans Filarr', 'Open in Filarr')} <span className="tag-rec">{tr('Recommandé', 'Recommended')}</span></span>
                <span className="hint" style={{ fontSize: 14 }}>
                  {tr('Filarr s’ouvre dans un nouvel onglet, sur Publier, et reçoit le paquet de ce seul Builder. Avec l’application de bureau, téléchargez le paquet ou utilisez le terminal.', 'Filarr opens in a new tab, on Publish, and receives the package from this Builder only. With the desktop app, download the package or use the terminal.')}
                </span>
                {handoffText ? <span role="status" className={handoff?.state === 'sent' ? 'banner banner-ok' : handoff?.state === 'waiting' ? 'banner' : 'banner banner-warn'}>{handoffText}</span> : null}
              </div>
              <button type="button" className="btn btn-primary btn-md" disabled={!pack?.ok || !originOk} onClick={startHandoff}>{tr('Ouvrir dans Filarr', 'Open in Filarr')}</button>
            </article>
            <article className="way">
              <div className="txt">
                <span className="t">{tr('Télécharger le paquet', 'Download the package')}</span>
                <span className="hint" style={{ fontSize: 14 }}>{tr('Puis déposez-le dans Place de marché → Publier. Fonctionne aussi hors ligne jusqu’à la signature.', 'Then drop it in Marketplace → Publish. Also works offline until signing.')}</span>
              </div>
              <button type="button" className="btn btn-md" disabled={!pack?.ok} onClick={() => pack?.bytes && pack.fileName && download(pack.bytes, pack.fileName)}>{tr('Télécharger .filarrext', 'Download .filarrext')}</button>
            </article>
            <article className="way" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span className="t" style={{ fontSize: 15, fontWeight: 650 }}>{tr('Depuis votre terminal', 'From your terminal')}</span>
              <pre className="term">
                <code>
                  <span className="p">$</span> npx filarr-ext publish {pack?.fileName ?? `${m.id}-${version}.filarrext`}
                  {'\n'}
                  <span className="c">{tr('  ◇ Filarr s’ouvre sur cet ordinateur avec le paquet\n  ◇ Relecture et signature : dans Filarr', '  ◇ Filarr opens on this computer with the package\n  ◇ Review and signature: in Filarr')}</span>
                </code>
              </pre>
              <span className="hint">{tr('La commande ne demande ni mot de passe ni clé : elle remet le paquet à l’application. L’intégration continue attendra une clé de publication dédiée.', 'The command asks for no password or key: it hands the package to the app. Continuous integration will wait for a dedicated publishing key.')}</span>
            </article>
            <details className="dev">
              <summary>{tr('Origine de Filarr (développement)', 'Filarr origin (development)')}</summary>
              <div className="field" style={{ marginTop: 8, maxWidth: 420 }}>
                <label htmlFor="p-origin" style={{ fontSize: 13 }}>{tr('Le paquet n’est remis qu’à cette origine exacte', 'The package is handed only to this exact origin')}</label>
                <input
                  id="p-origin"
                  className="input input-sm mono"
                  value={origin}
                  aria-invalid={!originOk}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    const ok = normalizeFilarrOrigin(e.target.value);
                    setPref('filarr-origin', ok && ok !== DEFAULT_FILARR_ORIGIN ? ok : null);
                  }}
                />
                <span className={originOk ? 'hint' : 'err'}>{originOk ? tr(`Filarr s’ouvrira sur ${originOk}/?filarr-publish=builder`, `Filarr will open on ${originOk}/?filarr-publish=builder`) : tr('https://…, ou http://localhost pour le développement', 'https://…, or http://localhost for development')}</span>
                <span className="hint">{tr('Un Filarr de développement n’accepte que le Builder servi sur http://localhost:5173.', 'A development Filarr only accepts the Builder served on http://localhost:5173.')}</span>
              </div>
            </details>
          </section>

          <aside aria-labelledby="pub-t" className="side">
            <section className="card" style={{ gap: 12 }}>
              <h2 id="pub-t">{tr('Ce qui deviendra public', 'What will become public')}</h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                <li>{mode === 'nocode' ? tr('le bundle : le moteur sans code et votre configuration, tels quels ;', 'the bundle: the no-code engine and your configuration, as is;') : tr('le bundle JavaScript, tel quel ;', 'the JavaScript bundle, as is;')}</li>
                <li>{tr('nom, description, icône, catégorie, types de fichiers ;', 'name, description, icon, category, file types;')}</li>
                <li>{tr(`${shots} capture${shots > 1 ? 's' : ''}${notes ? ` et les nouveautés de la ${version}` : ''} ;`, `${shots} screenshot${shots > 1 ? 's' : ''}${notes ? ` and the release notes of ${version}` : ''};`)}</li>
                <li>{m.author ? tr(`le nom publié « ${m.author} » et l’empreinte de votre clé ;`, `the published name “${m.author}” and your key’s fingerprint;`) : tr('l’empreinte de votre clé ;', 'your key’s fingerprint;')}</li>
                <li>{tr('le nombre d’installations.', 'the number of installs.')}</li>
              </ul>
              <p className="hint" style={{ margin: 0 }}>{tr('Votre e-mail, vos fichiers et vos notes restent privés.', 'Your email, your files and your notes stay private.')}</p>
              <div className="registry">
                <strong>{tr('Copié dans le registre public', 'Copied to the public registry')}</strong>
                <span>{tr('Bundle, manifeste et signature rejoignent filarr-extensions, lisibles par tous, sans compte. Retirer l’extension du catalogue ne les efface pas du registre.', 'Bundle, manifest and signature join filarr-extensions, readable by anyone, without an account. Removing the extension from the catalog does not erase them from the registry.')}</span>
              </div>
              <dl className="facts">
                <dt>sha256</dt>
                <dd title={pack?.bundleSha256}>{pack?.bundleSha256 ? `${pack.bundleSha256.slice(0, 4)}…${pack.bundleSha256.slice(-4)}` : '—'}</dd>
                <dt>{tr('Identifiant', 'Identifier')}</dt>
                <dd>{m.id}</dd>
                <dt>{tr('Version', 'Version')}</dt>
                <dd>{version} · {tr('unique, définitive', 'unique, final')}</dd>
                <dt>{tr('Source', 'Source')}</dt>
                <dd>{project.listing?.sourceUrl ?? tr('non déclarée', 'not declared')}</dd>
                <dt>{tr('Outils', 'Tools')}</dt>
                <dd>{BUILDER_TOOL} · {mode === 'nocode' ? tr(`moteur ${build?.engineVersion ?? '1.0.0'}`, `engine ${build?.engineVersion ?? '1.0.0'}`) : `esbuild-wasm ${ESBUILD_VERSION}`}</dd>
                <dt>{tr('Paquet', 'Package')}</dt>
                <dd>{pack?.bytes ? formatBytes(pack.bytes.byteLength, lang) : '—'}</dd>
              </dl>
              <p className="notice">{tr('Le Builder ne signe jamais et ne voit jamais votre clé. Il ne demande aucun mot de passe et n’appelle aucun serveur de Filarr.', 'The Builder never signs and never sees your key. It asks for no password and calls no Filarr server.')}</p>
            </section>
            <section className="card">
              <h2>{tr('Après la publication', 'After publishing')}</h2>
              <p className="hint" style={{ margin: 0 }}>{tr('Une fois signée dans Filarr, cette version est définitive. Notez-la : la suivante devra la dépasser.', 'Once signed in Filarr, this version is final. Record it: the next one will have to be higher.')}</p>
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={meta.lastPublished === version} onClick={() => setMeta((mm) => ({ ...mm, lastPublished: version }))}>
                {meta.lastPublished === version ? tr(`${version} notée comme publiée`, `${version} recorded as published`) : tr(`J’ai publié la ${version}`, `I published ${version}`)}
              </button>
            </section>
            <button type="button" className="btn" disabled={verifying || !build} onClick={() => void prepare()}>{verifying ? tr('Vérification…', 'Checking…') : tr('Tout revérifier', 'Check everything again')}</button>
          </aside>
        </div>
      </main>
    </div>
  );
}
