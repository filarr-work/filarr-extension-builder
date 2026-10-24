/**
 * Sans code — Données (maquette « NoCodeDonnees ») : nom, identifiant, type de
 * fichier, format du contenu ; un fichier d'exemple dont les champs sont
 * DEVINÉS, puis corrigés (chemin, type, libellé, obligatoire) ; les garanties
 * du moteur.
 */

import { Fragment, useMemo, useRef, useState } from 'react';
import { EXTENSION_RE, SLUG_RE } from '@filarr/extension-api';
import { validateConfig, type FieldDef, type FieldType, type FormatDef, type NocodeConfig } from '@filarr/nocode-engine';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { formatBytes, strictText } from '../lib/bytes';
import { defaultView } from '../lib/compose';
import { addField, changeType, defaultToText, flattenFields, freshKey, labelText, setLabel, textToDefault, typesFor, updateField, type FieldRow } from '../lib/fields';
import { humanize, inferFields, isUsableKey, type InferResult } from '../lib/infer';
import { normalizePath, sampleFiles } from '../lib/project';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { go, href } from '../state/router';

const TYPE_NAMES: Record<FieldType, [string, string]> = {
  text: ['Texte court', 'Short text'],
  longtext: ['Texte long', 'Long text'],
  number: ['Nombre', 'Number'],
  boolean: ['Case à cocher', 'Checkbox'],
  date: ['Date', 'Date'],
  url: ['Lien (URL)', 'Link (URL)'],
  email: ['E-mail', 'Email'],
  choice: ['Choix', 'Choice'],
  tags: ['Étiquettes', 'Tags'],
  rating: ['Note en étoiles', 'Star rating'],
  textlist: ['Liste de textes', 'List of texts'],
  list: ['Liste d’éléments', 'List of items'],
  object: ['Groupe de champs', 'Group of fields'],
};

const FORMATS: { type: FormatDef['type']; name: [string, string]; sample: string }[] = [
  { type: 'json', name: ['JSON', 'JSON'], sample: '{ "titre": … }' },
  { type: 'csv', name: ['CSV / TSV', 'CSV / TSV'], sample: 'titre;portions;…' },
  { type: 'lines', name: ['Ligne à ligne', 'Line by line'], sample: '- [ ] acheter…' },
  { type: 'keyvalue', name: ['Clé : valeur', 'Key: value'], sample: 'titre: Tarte…' },
];

/** Le nom d'un fichier d'exemple ajouté : son nom de base, nettoyé, dans `exemples/`. */
function sampleName(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').slice(0, 120);
  return clean && normalizePath(clean) ? clean : null;
}

export function DataScreen() {
  const { tr, lang } = usePrefs();
  const { key, files, setFiles, project, config, setConfig, updateProject, meta, setMeta } = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const samplesDir = project?.samples ?? 'exemples';
  const samples = sampleFiles(files, samplesDir);
  const current = samples.find((s) => s.name === selected) ?? samples[0] ?? null;
  const currentText = current ? strictText(files[current.path]) : null;

  const seen: InferResult['values'] = useMemo(() => {
    if (!currentText || !config) return {};
    try {
      return inferFields(currentText, config.format, current?.name).values;
    } catch {
      return {};
    }
  }, [currentText, config, current?.name]);

  if (!project || !config) {
    return (
      <div className="app">
        <ProjectHeader screen="donnees" />
        <main className="page"><p className="banner banner-err">{tr('nocode.json est illisible : corrigez-le dans « Essai ».', 'nocode.json is unreadable: fix it in “Try”.')}</p></main>
      </div>
    );
  }
  const m = project.manifest;
  const verdict = validateConfig(config);
  const fieldIssues = verdict.ok ? [] : verdict.issues.filter((i) => i.path.startsWith('fields') || i.path.startsWith('format'));

  const apply = (r: InferResult, keepView = false) => {
    setConfig((c) => {
      const next: NocodeConfig = { ...c, format: r.format, fields: r.fields };
      const view = keepView && c.view.length ? c.view : defaultView(next);
      return { ...next, view };
    });
    setNotes(r.notes);
  };

  const infer = (text: string, name: string, format?: FormatDef) => {
    setError(null);
    try {
      const r = inferFields(text, format, name);
      apply(r);
      setStatus(tr(`${r.fields.length} champ${r.fields.length > 1 ? 's' : ''} trouvé${r.fields.length > 1 ? 's' : ''} dans ${name} ; une première vue est proposée.`, `${r.fields.length} field${r.fields.length > 1 ? 's' : ''} found in ${name}; a first view is suggested.`));
    } catch (e) {
      setError(tr(`Exemple illisible : ${e instanceof Error ? e.message : String(e)}`, `Unreadable sample: ${e instanceof Error ? e.message : String(e)}`));
    }
  };

  const loadSample = async (file: File) => {
    const name = sampleName(file.name);
    if (!name) {
      setError(tr('Nom de fichier refusé.', 'File name refused.'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(tr('Plus de 8 Mio : le moteur ne l’ouvrirait pas.', 'Over 8 MiB: the engine would not open it.'));
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const t = strictText(bytes);
    setFiles((f) => ({ ...f, [`${samplesDir}/${name}`]: bytes }));
    setSelected(name);
    if (t === null) {
      setError(tr('Ce fichier n’est pas du texte UTF-8 : le moteur sans code ne lit que des formats texte. Une extension avec code saura le lire.', 'This file is not UTF-8 text: the no-code engine only reads text formats. An extension with code can read it.'));
      return;
    }
    infer(t, name);
  };

  const pickFormat = (type: FormatDef['type']) => {
    const format: FormatDef = type === 'csv' ? { type, ...(config.format.type === 'csv' && config.format.delimiter ? { delimiter: config.format.delimiter } : {}) } : { type } as FormatDef;
    if (currentText && current) infer(currentText, current.name, format);
    else setConfig((c) => ({ ...c, format, fields: type === 'lines' ? [{ key: 'text', type: 'text', label: { fr: 'Élément', en: 'Item' } }] : c.format.type === type ? c.fields : [], view: [] }));
  };

  const setFormat = (patch: Partial<Record<string, unknown>>) => setConfig((c) => ({ ...c, format: { ...c.format, ...patch } as FormatDef }));
  const editField = (row: FieldRow, fn: (f: FieldDef) => FieldDef | null) => setConfig((c) => ({ ...c, fields: updateField(c.fields, row.index, fn) }));
  const rows = flattenFields(config.fields);
  const fixedLevel = config.format.type === 'lines' || (config.format.type === 'keyvalue' && config.format.mode === 'entries');

  const setIdentity = (patch: { name?: string; id?: string; exts?: string[] }) => {
    updateProject((raw) => {
      const man = raw.manifest as Record<string, unknown>;
      if (patch.name !== undefined) man.name = patch.name;
      if (patch.id !== undefined) man.id = patch.id;
      if (patch.exts !== undefined) man.extensions = patch.exts;
    });
    // L'identifiant de la configuration DOIT être celui du manifeste (sinon sandbox_editor_not_found).
    if (patch.id !== undefined) setConfig((c) => ({ ...c, id: patch.id as string }));
  };

  const required = meta.required ?? {};
  const toggleRequired = (path: string, on: boolean) => setMeta((mm) => ({ ...mm, required: { ...(mm.required ?? {}), [path]: on } }));

  return (
    <div className="app">
      <Skip />
      <ProjectHeader screen="donnees" />
      <main id="contenu" className="page page-wide">
        <div className="split">
          <div className="main" style={{ gap: 26 }}>
            <div className="stack" style={{ ['--gap' as string]: '6px' }}>
              <h1>{tr('Votre fichier', 'Your file')}</h1>
              <p className="lead" style={{ fontSize: 15 }}>
                {tr('Le moteur sans code lit votre format, l’affiche et le réécrit. Montrez-lui un exemple : il devine les champs, vous corrigez.', 'The no-code engine reads your format, shows it and writes it back. Show it an example: it guesses the fields, you correct them.')}
              </p>
            </div>

            <div className="grid-auto" style={{ ['--min' as string]: '200px' }}>
              <div className="field">
                <label htmlFor="nc-name">{tr('Nom', 'Name')}</label>
                <input id="nc-name" className="input" value={String(m.name ?? '')} maxLength={100} onChange={(e) => setIdentity({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nc-id">{tr('Identifiant', 'Identifier')}</label>
                <input id="nc-id" className="input mono" value={String(m.id ?? '')} spellCheck={false} aria-invalid={!SLUG_RE.test(String(m.id))} aria-describedby="nc-id-h" onChange={(e) => setIdentity({ id: e.target.value.toLowerCase() })} />
                <span id="nc-id-h" className={SLUG_RE.test(String(m.id)) ? 'hint' : 'err'}>{tr('Définitif une fois publié.', 'Final once published.')}</span>
              </div>
              <div className="field">
                <label htmlFor="nc-ext">{tr('Type de fichier', 'File type')}</label>
                <ExtInput value={m.extensions ?? []} onChange={(exts) => setIdentity({ exts })} />
              </div>
            </div>

            <fieldset className="stack" style={{ ['--gap' as string]: '10px' }}>
              <legend style={{ paddingBottom: 10 }}>{tr('Format du contenu', 'Content format')}</legend>
              <div className="grid-auto" style={{ ['--min' as string]: '160px', ['--gap' as string]: '10px' }}>
                {FORMATS.map((f) => (
                  <button key={f.type} type="button" className="tile" style={{ gap: 4, padding: '12px 14px' }} aria-pressed={config.format.type === f.type} onClick={() => pickFormat(f.type)}>
                    <span className="tile-name">{lang === 'fr' ? f.name[0] : f.name[1]}</span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{f.sample}</span>
                  </button>
                ))}
              </div>
              <div className="row" style={{ fontSize: 13 }}>
                {config.format.type === 'csv' ? (
                  <label className="row" style={{ gap: 8 }}>
                    {tr('Séparateur', 'Delimiter')}
                    <select className="select input-sm" style={{ width: 'auto' }} value={config.format.delimiter ?? ','} onChange={(e) => setFormat({ delimiter: e.target.value === ',' ? undefined : e.target.value })}>
                      <option value=",">{tr('virgule ,', 'comma ,')}</option>
                      <option value=";">{tr('point-virgule ;', 'semicolon ;')}</option>
                      <option value={'\t'}>{tr('tabulation', 'tab')}</option>
                    </select>
                  </label>
                ) : null}
                {config.format.type === 'keyvalue' ? (
                  <>
                    <label className="row" style={{ gap: 8 }}>
                      {tr('Séparateur', 'Separator')}
                      <select className="select input-sm" style={{ width: 'auto' }} value={config.format.separator ?? ':'} onChange={(e) => setFormat({ separator: e.target.value === ':' ? undefined : e.target.value })}>
                        <option value=":">clé: valeur</option>
                        <option value="=">clé = valeur</option>
                      </select>
                    </label>
                    <label className="row" style={{ gap: 8 }}>
                      {tr('Lecture', 'Reading')}
                      <select
                        className="select input-sm"
                        style={{ width: 'auto' }}
                        value={config.format.mode ?? 'fields'}
                        onChange={(e) => {
                          const format = { ...config.format, mode: e.target.value === 'fields' ? undefined : 'entries' } as FormatDef;
                          if (currentText && current) infer(currentText, current.name, format);
                          else setConfig((c) => ({ ...c, format }));
                        }}
                      >
                        <option value="fields">{tr('chaque clé est un champ', 'each key is a field')}</option>
                        <option value="entries">{tr('une liste d’entrées (glossaire)', 'a list of entries (glossary)')}</option>
                      </select>
                    </label>
                  </>
                ) : null}
                {config.format.type === 'json' ? (
                  <label className="row" style={{ gap: 8 }}>
                    {tr('Indentation d’un fichier neuf', 'Indentation of a new file')}
                    <select className="select input-sm" style={{ width: 'auto' }} value={String(config.format.indent ?? 2)} onChange={(e) => setFormat({ indent: e.target.value === 'tab' ? 'tab' : Number(e.target.value) === 2 ? undefined : Number(e.target.value) })}>
                      <option value="0">0</option>
                      <option value="2">2</option>
                      <option value="4">4</option>
                      <option value="tab">{tr('tabulation', 'tab')}</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </fieldset>

            <section aria-labelledby="fields-t" className="stack" style={{ ['--gap' as string]: '10px' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 id="fields-t" className="section-title">{current ? tr('Champs trouvés dans l’exemple', 'Fields found in the example') : tr('Champs', 'Fields')}</h2>
                {!fixedLevel ? (
                  <button type="button" className="link-btn" onClick={() => setConfig((c) => ({ ...c, fields: addField(c.fields, [], { key: freshKey(c.fields), type: 'text', label: tr('Nouveau champ', 'New field') }) }))}>
                    {tr('Ajouter un champ', 'Add a field')}
                  </button>
                ) : null}
              </div>
              {status ? <p className="hint" role="status" style={{ margin: 0 }}>{status}</p> : null}
              {rows.length === 0 ? (
                <p className="empty">{tr('Aucun champ pour l’instant : chargez un fichier d’exemple, ou ajoutez des champs à la main.', 'No fields yet: load a sample file, or add fields by hand.')}</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">{tr('Champ', 'Field')}</th>
                        <th scope="col">{tr('Type', 'Type')}</th>
                        <th scope="col">{tr('Libellé affiché', 'Displayed label')}</th>
                        <th scope="col">{tr('Obligatoire', 'Required')}</th>
                        <th scope="col"><span className="sr-only">{tr('Actions', 'Actions')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const types = typesFor(config.format, r.depth);
                        const isFixed = fixedLevel && r.depth === 0;
                        const d = defaultToText(r.def);
                        const rowId = `f-${r.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        return (
                          <Fragment key={r.path + r.index.join('.')}>
                            <tr className={r.depth ? 'sub' : ''}>
                              <td className="path" style={{ paddingLeft: 12 + r.depth * 16 }}>
                                {isFixed ? (
                                  r.path
                                ) : (
                                  <input
                                    className="input mono"
                                    style={{ width: `${Math.max(8, r.def.key.length + 2)}ch`, minWidth: '8ch' }}
                                    aria-label={tr(`Clé du champ ${r.path}`, `Key of field ${r.path}`)}
                                    defaultValue={r.def.key}
                                    onBlur={(e) => {
                                      const k = e.target.value.trim();
                                      if (k && k !== r.def.key && isUsableKey(k)) editField(r, (f) => ({ ...f, key: k }));
                                      else e.target.value = r.def.key;
                                    }}
                                  />
                                )}
                                {r.def.type === 'list' ? '[]' : ''}
                              </td>
                              <td>
                                <select
                                  className="select"
                                  aria-label={tr(`Type de ${r.path}`, `Type of ${r.path}`)}
                                  value={r.def.type}
                                  disabled={isFixed && r.def.key === 'done'}
                                  onChange={(e) => editField(r, (f) => changeType(f, e.target.value as FieldType, seen[r.path] ?? []))}
                                >
                                  {(isFixed ? (r.def.key === 'value' ? ['text', 'url', 'email'] : [r.def.type]) : types).map((t) => (
                                    <option key={t} value={t}>{lang === 'fr' ? TYPE_NAMES[t as FieldType][0] : TYPE_NAMES[t as FieldType][1]}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="input"
                                  aria-label={tr(`Libellé de ${r.path}`, `Label of ${r.path}`)}
                                  value={labelText(r.def.label, lang)}
                                  placeholder={humanize(r.def.key)}
                                  maxLength={200}
                                  onChange={(e) => editField(r, (f) => {
                                    const label = setLabel(f.label, lang, e.target.value);
                                    const { label: _old, ...rest } = f;
                                    return label === undefined ? (rest as FieldDef) : { ...rest, label };
                                  })}
                                />
                              </td>
                              <td>
                                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                  {config.format.type !== 'lines' && r.depth <= 1 && !(r.depth === 1 && !r.path.includes('[]')) && r.def.type !== 'object' ? (
                                    <label className="check" style={{ whiteSpace: 'nowrap' }}>
                                      <input type="checkbox" checked={required[r.path] === true} onChange={(e) => toggleRequired(r.path, e.target.checked)} />
                                      {required[r.path] ? tr('Oui', 'Yes') : tr('Non', 'No')}
                                    </label>
                                  ) : <span className="hint">—</span>}
                                  {r.def.type !== 'list' && r.def.type !== 'object' ? (
                                    <input
                                      className="input"
                                      style={{ width: '9ch' }}
                                      aria-label={tr(`Valeur par défaut de ${r.path}`, `Default value of ${r.path}`)}
                                      placeholder={tr('défaut', 'default')}
                                      defaultValue={d}
                                      key={`${r.path}-${d}`}
                                      onBlur={(e) => editField(r, (f) => {
                                        const v = textToDefault(f, e.target.value);
                                        const { default: _old, ...rest } = f;
                                        return v === undefined ? (rest as FieldDef) : ({ ...rest, default: v } as FieldDef);
                                      })}
                                    />
                                  ) : null}
                                </div>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button type="button" className="icon-btn" aria-expanded={open === r.path} aria-controls={`${rowId}-d`} aria-label={tr(`Réglages de ${r.path}`, `Settings of ${r.path}`)} onClick={() => setOpen(open === r.path ? null : r.path)}>⋯</button>
                                {!isFixed ? (
                                  <button type="button" className="icon-btn" aria-label={tr(`Retirer ${r.path}`, `Remove ${r.path}`)} onClick={() => editField(r, () => null)}>×</button>
                                ) : null}
                              </td>
                            </tr>
                            {open === r.path ? (
                              <tr className="detail-row" id={`${rowId}-d`}>
                                <td colSpan={5}>
                                  <FieldDetails def={r.def} onChange={(fn) => editField(r, fn)} canAddSub={(r.def.type === 'list' || r.def.type === 'object') && r.depth < 2} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {notes.length ? (
                <ul className="checklist">
                  {notes.map((n, i) => (
                    <li key={i}><span aria-hidden="true" className="sym-warn">!</span>{n}</li>
                  ))}
                </ul>
              ) : null}
              {fieldIssues.length ? (
                <ul className="checklist" aria-live="polite">
                  {fieldIssues.map((i, k) => (
                    <li key={k} style={{ color: 'var(--danger)' }}><span aria-hidden="true">✗</span>{i.path} — {i.message}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="checklist">
                <li><span aria-hidden="true" className="sym-ok">✓</span>{tr('Les champs que la vue n’affiche pas sont réécrits tels quels : rien ne se perd.', 'Fields the view does not show are written back as they are: nothing is lost.')}</li>
                <li><span aria-hidden="true" className="sym-ok">✓</span>{tr('Un fichier neuf (vide) démarre avec les valeurs par défaut de chaque champ.', 'A new (empty) file starts with each field’s default value.')}</li>
                <li><span aria-hidden="true" className="sym-ok">✓</span>{tr('« Obligatoire » : le Builder vérifie que vos exemples ont ce champ. Le moteur, lui, n’impose rien — un fichier qui ne l’a pas s’ouvre avec le champ vide.', '“Required”: the Builder checks that your samples have this field. The engine imposes nothing — a file without it opens with the field empty.')}</li>
              </ul>
            </section>

            {error ? <div className="banner banner-err" role="alert">{error}</div> : null}
            <div className="row">
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => {
                  if (config.view.length === 0 && config.fields.length) setConfig((c) => ({ ...c, view: defaultView(c) }));
                  go(href(key, 'vue'));
                }}
              >
                {tr('Suivant : la vue', 'Next: the view')}
              </button>
            </div>
          </div>

          <aside className="side">
            <section className="card" aria-labelledby="ex-t">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 id="ex-t">{current ? tr('Exemple chargé', 'Loaded example') : tr('Un fichier d’exemple', 'A sample file')}</h2>
                <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
                  {current ? tr('En charger un autre', 'Load another one') : tr('Charger un exemple', 'Load a sample')}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  aria-label={tr('Fichier d’exemple', 'Sample file')}
                  data-testid="sample-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void loadSample(f);
                  }}
                />
              </div>
              {samples.length > 1 ? (
                <select className="select input-sm mono" aria-label={tr('Exemple', 'Example')} value={current?.name} onChange={(e) => setSelected(e.target.value)}>
                  {samples.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              ) : null}
              {current ? (
                <>
                  <span className="mono hint" style={{ fontSize: 12 }}>{current.name} · {formatBytes(current.size, lang)}</span>
                  <pre className="term" style={{ maxHeight: 420, whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.65 }}>{currentText === null ? tr('(fichier binaire)', '(binary file)') : currentText.slice(0, 6000)}</pre>
                  {currentText !== null ? (
                    <button type="button" className="btn btn-sm" onClick={() => infer(currentText, current.name, config.format)}>{tr('Deviner les champs à nouveau', 'Guess the fields again')}</button>
                  ) : null}
                </>
              ) : (
                <p className="hint" style={{ margin: 0 }}>{tr('Il rejoint le dossier exemples/ du projet : le simulateur l’ouvrira aussi.', 'It joins the project’s exemples/ folder: the simulator will open it too.')}</p>
              )}
            </section>
            <section className="card" aria-labelledby="lim-t">
              <h2 id="lim-t">{tr('Ce que le moteur s’interdit', 'What the engine refuses to do')}</h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                <li>{tr('exécuter quoi que ce soit venant du fichier ou de la configuration ;', 'run anything coming from the file or the configuration;')}</li>
                <li>{tr('insérer du HTML : tout s’affiche comme du texte ;', 'insert HTML: everything is shown as text;')}</li>
                <li>{tr('lire au-delà de 8 Mio ou de 12 niveaux d’imbrication ;', 'read beyond 8 MiB or 12 levels of nesting;')}</li>
                <li>{tr('accepter les clés', 'accept the keys')} <span className="mono">__proto__</span> {tr('et', 'and')} <span className="mono">constructor</span>.</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ExtInput({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const { tr } = usePrefs();
  const [draft, setDraft] = useState(value.map((e) => `.${e}`).join(', '));
  const parts = draft.split(/[\s,;]+/).map((x) => x.replace(/^\.+/, '').toLowerCase()).filter(Boolean);
  const ok = parts.length >= 1 && parts.length <= 10 && parts.every((p) => EXTENSION_RE.test(p));
  return (
    <>
      <input
        id="nc-ext"
        className="input mono"
        value={draft}
        aria-invalid={!ok}
        aria-describedby="nc-ext-h"
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          const p = e.target.value.split(/[\s,;]+/).map((x) => x.replace(/^\.+/, '').toLowerCase()).filter(Boolean);
          if (p.length >= 1 && p.length <= 10 && p.every((x) => EXTENSION_RE.test(x))) onChange([...new Set(p)]);
        }}
      />
      <span id="nc-ext-h" className={ok ? 'hint' : 'err'}>{ok ? tr('De 1 à 10, séparés par des virgules.', 'From 1 to 10, separated by commas.') : tr('Minuscules et chiffres, 10 au plus, sans point.', 'Lowercase and digits, at most 10, no dot.')}</span>
    </>
  );
}

/** Les réglages d'un champ, propres à son type (ceux que le moteur admet, rien d'autre). */
function FieldDetails({ def, onChange, canAddSub }: { def: FieldDef; onChange(fn: (f: FieldDef) => FieldDef | null): void; canAddSub: boolean }) {
  const { tr, lang } = usePrefs();
  const num = (k: keyof FieldDef, label: string, opts: { int?: boolean } = {}) => (
    <label className="field" style={{ gap: 4 }}>
      <span className="label" style={{ fontSize: 13 }}>{label}</span>
      <input
        className="input input-sm"
        type="number"
        step={opts.int ? 1 : 'any'}
        defaultValue={def[k] === undefined ? '' : String(def[k])}
        onBlur={(e) => onChange((f) => {
          const n = e.target.value === '' ? undefined : Number(e.target.value);
          const next = { ...f } as Record<string, unknown>;
          if (n === undefined || !Number.isFinite(n)) delete next[k];
          else next[k] = n;
          return next as unknown as FieldDef;
        })}
      />
    </label>
  );
  const str = (k: 'placeholder' | 'unit' | 'trueValue' | 'falseValue' | 'separator', label: string, local = false) => (
    <label className="field" style={{ gap: 4 }}>
      <span className="label" style={{ fontSize: 13 }}>{label}</span>
      <input
        className="input input-sm"
        defaultValue={local ? labelText(def[k] as never, lang) : String(def[k] ?? '')}
        onBlur={(e) => onChange((f) => {
          const next = { ...f } as Record<string, unknown>;
          const v = local ? setLabel(f[k] as never, lang, e.target.value) : e.target.value === '' ? undefined : e.target.value;
          if (v === undefined) delete next[k];
          else next[k] = v;
          return next as unknown as FieldDef;
        })}
      />
    </label>
  );
  return (
    <div className="stack" style={{ ['--gap' as string]: '10px', padding: '6px 0' }}>
      <div className="grid-auto" style={{ ['--min' as string]: '150px', ['--gap' as string]: '10px' }}>
        {['text', 'longtext', 'url', 'email', 'textlist', 'tags', 'number'].includes(def.type) ? str('placeholder', tr('Indication (champ vide)', 'Placeholder'), true) : null}
        {def.type === 'number' ? (
          <>
            {num('min', 'min')}
            {num('max', 'max')}
            {num('step', tr('pas', 'step'))}
            {num('decimals', tr('décimales (0–6)', 'decimals (0–6)'), { int: true })}
            {str('unit', tr('unité', 'unit'), true)}
          </>
        ) : null}
        {def.type === 'rating' ? num('max', tr('étoiles (1–10)', 'stars (1–10)'), { int: true }) : null}
        {def.type === 'boolean' ? (
          <>
            {str('trueValue', tr('écrit pour vrai', 'written for true'))}
            {str('falseValue', tr('écrit pour faux', 'written for false'))}
          </>
        ) : null}
        {def.type === 'tags' ? str('separator', tr('séparateur (CSV, clé: valeur)', 'separator (CSV, key: value)')) : null}
      </div>
      {def.type === 'choice' ? (
        <div className="stack" style={{ ['--gap' as string]: '6px' }}>
          <span className="label" style={{ fontSize: 13 }}>{tr('Options', 'Options')}</span>
          {(def.options ?? []).map((o, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input className="input input-sm mono" style={{ width: '14ch' }} aria-label={tr(`Valeur ${i + 1}`, `Value ${i + 1}`)} defaultValue={o.value} onBlur={(e) => onChange((f) => ({ ...f, options: (f.options ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))} />
              <input className="input input-sm" style={{ width: '18ch' }} aria-label={tr(`Libellé ${i + 1}`, `Label ${i + 1}`)} placeholder={o.value} defaultValue={labelText(o.label, lang)} onBlur={(e) => onChange((f) => ({ ...f, options: (f.options ?? []).map((x, j) => { if (j !== i) return x; const label = setLabel(x.label, lang, e.target.value); const { label: _l, ...rest } = x; return label === undefined ? rest : { ...rest, label }; }) }))} />
              <input type="color" aria-label={tr(`Couleur ${i + 1}`, `Color ${i + 1}`)} value={o.color ?? '#64748b'} onChange={(e) => onChange((f) => ({ ...f, options: (f.options ?? []).map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) }))} />
              <button type="button" className="icon-btn" aria-label={tr(`Retirer l’option ${i + 1}`, `Remove option ${i + 1}`)} onClick={() => onChange((f) => ({ ...f, options: (f.options ?? []).filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onChange((f) => ({ ...f, options: [...(f.options ?? []), { value: `option-${(f.options?.length ?? 0) + 1}` }] }))}>{tr('Ajouter une option', 'Add an option')}</button>
        </div>
      ) : null}
      {canAddSub ? (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onChange((f) => ({ ...f, fields: [...(f.fields ?? []), { key: freshKey(f.fields ?? []), type: 'text', label: tr('Nouveau champ', 'New field') }] }))}>
          {tr('Ajouter un sous-champ', 'Add a sub-field')}
        </button>
      ) : null}
    </div>
  );
}
