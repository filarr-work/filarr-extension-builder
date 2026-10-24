/**
 * Sans code — Vue et style (maquette « NoCodeVue ») : la palette des blocs du
 * moteur, la composition de la page (ordre, lien bloc ↔ champ, réglages), la
 * couleur d'accent, et l'aperçu EN DIRECT : le vrai moteur, construit à chaque
 * modification, monté dans la page bac à sable du simulateur.
 *
 * Les blocs s'ajoutent au clic (après le bloc choisi, ou dans la section ou la
 * carte choisie) ou se glissent dans la page ; tout se fait aussi au clavier.
 */

import { useMemo, useState, type DragEvent } from 'react';
import { validateConfig, type BlockDef, type BlockType, type FieldType, type LocalText, type NocodeConfig } from '@filarr/nocode-engine';
import { Modal } from '../components/chrome';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { text } from '../lib/bytes';
import { toCodeProject } from '../lib/tocode';
import {
  blockAt,
  blockTarget,
  configPathOf,
  createBlock,
  fieldPaths,
  insertBlock,
  itemFields,
  levelAt,
  localText,
  moveBlock,
  PALETTE,
  paletteEntry,
  removeBlock,
  reorderBlock,
  SCALAR,
  updateBlock,
  type BlockPath,
  type Level,
} from '../lib/compose';
import { setLabel } from '../lib/fields';
import { sampleFiles } from '../lib/project';
import { Simulator } from '../sim/Simulator';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { go, href } from '../state/router';

const ACCENTS: { c: string; fr: string; en: string }[] = [
  { c: '#3a6b94', fr: 'Bleu', en: 'Blue' },
  { c: '#b45309', fr: 'Ambre', en: 'Amber' },
  { c: '#047857', fr: 'Vert', en: 'Green' },
  { c: '#7c3aed', fr: 'Violet', en: 'Violet' },
];

const same = (a: BlockPath | null | undefined, b: BlockPath) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

export function ViewScreen() {
  const { tr, lang } = usePrefs();
  const { key, files, setFiles, project, config, setConfig, build } = useProject();
  const [sel, setSel] = useState<BlockPath | null>([0]);
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const [showCode, setShowCode] = useState(false);
  const [toCode, setToCode] = useState(false);
  const [drag, setDrag] = useState<{ from?: BlockPath; type?: BlockType; over?: BlockPath } | null>(null);
  const samples = useMemo(() => sampleFiles(files, project?.samples).map((s) => ({ name: s.name, bytes: files[s.path] })), [files, project?.samples]);

  if (!project || !config) {
    return (
      <div className="app">
        <ProjectHeader screen="vue" />
        <main className="page"><p className="banner banner-err">{tr('nocode.json est illisible : corrigez-le dans « Essai ».', 'nocode.json is unreadable: fix it in “Try”.')}</p></main>
      </div>
    );
  }
  const verdict = validateConfig(config);
  const issues = verdict.ok ? [] : verdict.issues;
  const view = config.view;
  const selBlock = sel ? blockAt(view, sel) : undefined;
  const selLevel: Level = sel ? levelAt(config, sel) : levelAt(config, [0]);
  const setView = (fn: (v: BlockDef[]) => BlockDef[]) => setConfig((c) => ({ ...c, view: fn(c.view) }));

  /** Où ajouter : dans la section ou la carte choisie, sinon juste après le bloc choisi. */
  const target = (): { parent: BlockPath; index: number } => {
    if (sel && selBlock && (selBlock.type === 'section' || selBlock.type === 'cards')) return { parent: sel, index: selBlock.blocks.length };
    if (sel && selBlock) return { parent: sel.slice(0, -1), index: sel[sel.length - 1] + 1 };
    return { parent: [], index: view.length };
  };
  const add = (type: BlockType, at = target()) => {
    const level = levelAt(config, [...at.parent, 0]);
    const b = createBlock(type, level);
    if (!b) return;
    setView((v) => insertBlock(v, at.parent, at.index, b));
    setSel([...at.parent, at.index]);
  };

  const onDrop = (e: DragEvent, parent: BlockPath, index: number) => {
    e.preventDefault();
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.type) add(d.type, { parent, index });
    else if (d.from && same(d.from.slice(0, -1), parent)) {
      const from = d.from[d.from.length - 1];
      const to = index > from ? index - 1 : index;
      setView((v) => reorderBlock(v, parent, from, to));
      setSel([...parent, to]);
    }
  };

  const issuesAt = (path: BlockPath) => {
    const p = configPathOf(path);
    return issues.filter((i) => i.path === p || i.path.startsWith(`${p}.`));
  };

  const renderList = (blocks: BlockDef[], parent: BlockPath, implicit: string | null) => (
    <div className="stack" style={{ ['--gap' as string]: '6px' }} role="list">
      {blocks.map((b, i) => {
        const path = [...parent, i];
        const entry = paletteEntry(b.type);
        const errs = issuesAt(path);
        const tag = `${entry.name[lang]} · ${blockTarget(b, implicit, lang)}`;
        return (
          <div key={path.join('.')} role="listitem" className={parent.length ? 'blk-nested' : undefined}>
            <div
              className={`blk${errs.length ? ' invalid' : ''}${same(drag?.over, path) ? ' drop-before' : ''}`}
              aria-current={same(sel, path) ? 'true' : undefined}
              draggable
              onDragStart={() => setDrag({ from: path })}
              onDragOver={(e) => {
                e.preventDefault();
                if (!same(drag?.over, path)) setDrag((d) => ({ ...d, over: path }));
              }}
              onDrop={(e) => onDrop(e, parent, i)}
              onDragEnd={() => setDrag(null)}
            >
              <span aria-hidden="true" className="glyph">{entry.glyph}</span>
              <button type="button" className="blk-tag" onClick={() => setSel(path)} aria-describedby={errs.length ? `blk-err-${path.join('-')}` : undefined} title={tag}>
                {tag}
              </button>
              <button type="button" className="icon-btn" aria-label={tr(`Monter « ${tag} »`, `Move “${tag}” up`)} disabled={i === 0} onClick={() => { const r = moveBlock(view, path, -1); setView(() => r.view); setSel(r.path); }}>↑</button>
              <button type="button" className="icon-btn" aria-label={tr(`Descendre « ${tag} »`, `Move “${tag}” down`)} disabled={i === blocks.length - 1} onClick={() => { const r = moveBlock(view, path, 1); setView(() => r.view); setSel(r.path); }}>↓</button>
              <button type="button" className="icon-btn" aria-label={tr(`Retirer « ${tag} »`, `Remove “${tag}”`)} onClick={() => { setView((v) => removeBlock(v, path)); setSel(null); }}>×</button>
            </div>
            {errs.length ? <span id={`blk-err-${path.join('-')}`} className="err" style={{ fontSize: 12 }}>{errs[0].message}</span> : null}
            {b.type === 'section' || b.type === 'cards' ? <div style={{ marginTop: 6 }}>{renderList(b.blocks, path, b.type === 'cards' ? null : implicit)}</div> : null}
          </div>
        );
      })}
      <div className="blk" style={{ borderStyle: 'dashed', justifyContent: 'center', color: 'var(--faint)', fontSize: 12, minHeight: 34 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, parent, blocks.length)}>
        {tr('Déposer un bloc ici', 'Drop a block here')}
      </div>
    </div>
  );

  const configText = text(files[project.build.kind === 'nocode' ? project.build.config : 'nocode.json']);
  const bundleTail = build?.ok && build.code ? build.code.split('\n').slice(-2).join('\n') : '';

  const passToCode = () => {
    setFiles((f) => toCodeProject(f, String(project.manifest.name ?? project.manifest.id), project.build.kind === 'nocode' ? project.build.config : 'nocode.json'));
    setToCode(false);
    go(href(key, 'essai'));
  };

  const at = target();
  const addLevel = levelAt(config, [...at.parent, 0]);

  return (
    <div className="app">
      <Skip />
      <ProjectHeader
        screen="vue"
        end={
          <>
            <div className="seg" role="group" aria-label={tr('Thème de l’aperçu', 'Preview theme')}>
              <button type="button" aria-pressed={scheme === 'light'} onClick={() => setScheme('light')}>{tr('Clair', 'Light')}</button>
              <button type="button" aria-pressed={scheme === 'dark'} onClick={() => setScheme('dark')}>{tr('Sombre', 'Dark')}</button>
            </div>
            <button type="button" className="btn btn-sm" style={{ minHeight: 34 }} onClick={() => setShowCode(true)}>{tr('Voir le code généré', 'See the generated code')}</button>
            <button type="button" className="btn btn-sm" style={{ minHeight: 34 }} onClick={() => setToCode(true)}>{tr('Passer en code', 'Switch to code')}</button>
          </>
        }
      />
      <main id="contenu" className="workbench">
        <nav aria-label={tr('Blocs', 'Blocks')} className="palette">
          <span className="rail-title" style={{ padding: '0 6px 6px' }}>{tr('Blocs', 'Blocks')}</span>
          {PALETTE.map((p) => {
            const possible = createBlock(p.type, addLevel) !== null;
            return (
              <button
                key={p.type}
                type="button"
                className="pal-btn"
                draggable={possible}
                aria-disabled={!possible}
                title={possible ? tr('Ajouter après le bloc choisi (ou glisser dans la page)', 'Add after the selected block (or drag into the page)') : tr('Aucun champ compatible à ce niveau', 'No compatible field at this level')}
                onDragStart={() => setDrag({ type: p.type })}
                onClick={() => possible && add(p.type)}
              >
                <span aria-hidden="true" className="glyph">{p.glyph}</span>
                {p.name[lang]}
              </button>
            );
          })}
          <span className="hint" style={{ fontSize: 12, padding: '8px 6px 0' }}>
            {tr('Glissez un bloc dans la page, ou cliquez-le pour l’ajouter après le bloc choisi ; puis reliez-le à un champ.', 'Drag a block into the page, or click it to add it after the selected block; then link it to a field.')}
          </span>
        </nav>

        <section aria-label={tr('Page de l’extension', 'Extension page')} className="desk">
          <div className="compo">
            <span className="compo-title">{tr('Composition', 'Layout')}</span>
            {view.length === 0 ? <p className="empty">{tr('Page vide : ajoutez un bloc.', 'Empty page: add a block.')}</p> : null}
            {renderList(view, [], levelAt(config, [0]).implicit)}
          </div>
          <div className="stack" style={{ ['--gap' as string]: '8px', minWidth: 0 }}>
            <span className="compo-title">{tr('Aperçu en direct · le vrai moteur', 'Live preview · the real engine')}</span>
            {issues.length ? (
              <div className="banner banner-err" role="status">
                {tr(`Configuration refusée par le moteur (${issues.length}) : l’aperçu montre la dernière version valide.`, `Configuration refused by the engine (${issues.length}): the preview shows the last valid version.`)}
                <br />
                <span className="mono" style={{ fontSize: 12 }}>{issues[0].path} — {issues[0].message}</span>
              </div>
            ) : null}
            <Simulator compact code={build?.ok ? (build.code ?? null) : null} buildKey={build?.at ?? 0} manifest={project.manifest} samples={samples} scheme={scheme} />
          </div>
        </section>

        <aside aria-labelledby="props-t" className="props">
          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
            <span className="rail-title" style={{ padding: 0 }}>{tr('Bloc sélectionné', 'Selected block')}</span>
            <h2 id="props-t">{selBlock ? paletteEntry(selBlock.type).name[lang] : tr('Aucun', 'None')}</h2>
          </div>
          {selBlock && sel ? (
            <BlockProps key={sel.join('.')} block={selBlock} level={selLevel} onChange={(nb) => setView((v) => updateBlock(v, sel, () => nb))} issues={issuesAt(sel).map((i) => `${i.path.slice(configPathOf(sel).length + 1) || '·'} — ${i.message}`)} />
          ) : (
            <p className="hint">{tr('Choisissez un bloc dans la composition.', 'Choose a block in the layout.')}</p>
          )}

          <div className="stack" style={{ ['--gap' as string]: '8px', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <span className="label">{tr('Couleur d’accent', 'Accent color')}</span>
            <div role="group" aria-label={tr('Couleur d’accent', 'Accent color')} className="swatches">
              {ACCENTS.map((a) => (
                <button key={a.c} type="button" className="swatch" aria-label={lang === 'fr' ? a.fr : a.en} aria-pressed={config.accent === a.c} style={{ background: a.c }} onClick={() => setConfig((c) => ({ ...c, accent: a.c }))} />
              ))}
              <input type="color" aria-label={tr('Couleur personnalisée', 'Custom color')} value={config.accent ?? '#3a6b94'} onChange={(e) => setConfig((c) => ({ ...c, accent: e.target.value }))} />
              <button type="button" className="link-btn" aria-pressed={config.accent === undefined} onClick={() => setConfig((c) => { const { accent: _a, ...rest } = c; return rest as NocodeConfig; })}>
                {tr('Celle de Filarr', 'Filarr’s')}
              </button>
            </div>
            <span className="hint">{tr('Clair ou sombre : l’extension suit le thème de Filarr toute seule.', 'Light or dark: the extension follows Filarr’s theme on its own.')}</span>
          </div>
          <p className="notice">{tr('En lecture seule, tous les blocs se figent. Ce n’est pas un réglage : le moteur le garantit.', 'In read-only mode, all blocks freeze. It is not a setting: the engine guarantees it.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => go(href(key, 'essai'))}>{tr('Suivant : l’essai', 'Next: try it')}</button>
        </aside>
      </main>

      <Modal open={showCode} onClose={() => setShowCode(false)} title={tr('Le code généré', 'The generated code')}>
        <p className="hint">{tr('Une extension sans code n’a pas de code à elle : c’est le moteur, identique pour toutes, suivi de ces deux lignes. Filarr relit la configuration sans l’exécuter, et vous la montrera avant de signer.', 'A no-code extension has no code of its own: it is the engine, the same for all, followed by these two lines. Filarr reads the configuration without running it, and will show it to you before signing.')}</p>
        <pre className="term" style={{ maxHeight: 160, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{bundleTail || tr('(construction en attente d’une configuration valide)', '(build waiting for a valid configuration)')}</pre>
        <span className="sub-label">nocode.json</span>
        <pre className="term" style={{ maxHeight: 340 }}>{configText}</pre>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setShowCode(false)}>{tr('Fermer', 'Close')}</button></div>
      </Modal>
      <Modal open={toCode} onClose={() => setToCode(false)} title={tr('Passer en code ?', 'Switch to code?')}>
        <p className="lead" style={{ fontSize: 14 }}>
          {tr('Le projet devient une extension avec code : src/index.js monte le même moteur avec votre nocode.json, que vous pourrez enrichir. Les écrans sans code ne serviront plus à ce projet. Exportez-le d’abord si vous voulez garder la version sans code.', 'The project becomes an extension with code: src/index.js mounts the same engine with your nocode.json, which you can then extend. The no-code screens will no longer apply to this project. Export it first if you want to keep the no-code version.')}
        </p>
        <p className="hint">{tr('Le paquet déclarera alors « avec code » : Filarr le relira comme un bundle, plus comme une configuration.', 'The package will then declare “with code”: Filarr will review it as a bundle, no longer as a configuration.')}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => setToCode(false)}>{tr('Annuler', 'Cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={passToCode}>{tr('Passer en code', 'Switch to code')}</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Les réglages d'un bloc ──────────────────────────────────────────────────

const IMPLICIT = '\u0000implicite';

function BlockProps({ block, level, onChange, issues }: { block: BlockDef; level: Level; onChange(b: BlockDef): void; issues: string[] }) {
  const { tr, lang } = usePrefs();
  const b = block as unknown as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => {
    const next = { ...b };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    onChange(next as unknown as BlockDef);
  };
  const localInput = (k: string, label: string, required = false) => (
    <div className="field" style={{ gap: 6 }}>
      <label className="label" htmlFor={`p-${k}`}>{label}</label>
      <input
        id={`p-${k}`}
        className="input"
        value={localText(b[k] as LocalText | undefined, lang)}
        aria-invalid={required && !localText(b[k] as LocalText | undefined, lang) ? true : undefined}
        maxLength={k === 'unit' ? 20 : 200}
        onChange={(e) => set({ [k]: setLabel(b[k] as LocalText | undefined, lang, e.target.value) ?? (required ? '?' : undefined) })}
      />
    </div>
  );
  const fieldSelect = (k: string, label: string, types: FieldType[], opts: { implicit?: boolean } = {}) => {
    const list = fieldPaths(level.fields, types).filter((f) => !opts.implicit || f.path !== level.implicit);
    const value = (b[k] as string | undefined) ?? (opts.implicit && level.implicit ? IMPLICIT : '');
    return (
      <div className="field" style={{ gap: 6 }}>
        <label className="label" htmlFor={`p-${k}`}>{label}</label>
        <select id={`p-${k}`} className="select mono" value={value} onChange={(e) => set({ [k]: e.target.value === IMPLICIT ? undefined : e.target.value })}>
          {opts.implicit && level.implicit ? <option value={IMPLICIT}>{`${level.implicit}[] (${tr('la liste du format', 'the format’s list')})`}</option> : null}
          {!list.some((f) => f.path === value) && value !== IMPLICIT ? <option value={value}>{value || '—'}</option> : null}
          {list.map((f) => (
            <option key={f.path} value={f.path}>{f.def.type === 'list' || f.def.type === 'textlist' ? `${f.path}[]` : f.path}</option>
          ))}
        </select>
      </div>
    );
  };
  const listPath = (b.field as string | undefined) ?? level.implicit ?? '';
  const subSelect = (k: string, label: string, types: FieldType[]) => {
    const subs = itemFields(level, b.field as string | undefined, types);
    return (
      <div className="field" style={{ gap: 6 }}>
        <label className="label" htmlFor={`p-${k}`}>{label}</label>
        <select id={`p-${k}`} className="select mono" value={(b[k] as string | undefined) ?? ''} onChange={(e) => set({ [k]: e.target.value || undefined })}>
          <option value="">{tr('(le premier qui convient)', '(the first that fits)')}</option>
          {subs.map((f) => (
            <option key={f.key} value={f.key}>{`${listPath}[].${f.key}`}</option>
          ))}
        </select>
      </div>
    );
  };
  const multi = (k: string, label: string, options: string[]) => {
    const cur = (b[k] as string[] | undefined) ?? [];
    return (
      <fieldset className="stack" style={{ ['--gap' as string]: '4px' }}>
        <legend className="label" style={{ paddingBottom: 6 }}>{label}</legend>
        {options.map((o) => (
          <label key={o} className="check mono" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={cur.includes(o)}
              onChange={(e) => {
                const next = e.target.checked ? [...cur, o] : cur.filter((x) => x !== o);
                set({ [k]: next.length ? options.filter((x) => next.includes(x)) : undefined });
              }}
            />
            {o}
          </label>
        ))}
      </fieldset>
    );
  };
  const intInput = (k: string, label: string, min: number, max: number) => (
    <div className="field" style={{ gap: 6 }}>
      <label className="label" htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} className="input" type="number" min={min} max={max} value={b[k] === undefined ? '' : String(b[k])} onChange={(e) => set({ [k]: e.target.value === '' ? undefined : Math.round(Number(e.target.value)) })} />
    </div>
  );
  const linked = tr('Champ lié', 'Linked field');
  const blockTitle = tr('Titre du bloc', 'Block title');
  const addBtn = tr('Bouton d’ajout', 'Add button');

  const body = (() => {
    switch (block.type) {
      case 'title':
        return <>{fieldSelect('field', linked, ['text', 'longtext'])}{localInput('placeholder', tr('Indication (titre vide)', 'Placeholder (empty title)'))}</>;
      case 'badges': {
        const all = fieldPaths(level.fields, SCALAR.filter((t) => t !== 'longtext' && t !== 'tags'));
        return (
          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <span className="label">{tr('Pastilles', 'Badges')}</span>
            {block.items.map((it, i) => {
              const def = all.find((f) => f.path === it.field)?.def;
              return (
                <div key={i} className="stack" style={{ ['--gap' as string]: '4px', padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <select className="select mono" aria-label={tr(`Champ de la pastille ${i + 1}`, `Field of badge ${i + 1}`)} value={it.field} onChange={(e) => set({ items: block.items.map((x, j) => (j === i ? { field: e.target.value } : x)) })}>
                      {all.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}
                    </select>
                    <button type="button" className="icon-btn" aria-label={tr(`Retirer la pastille ${i + 1}`, `Remove badge ${i + 1}`)} disabled={block.items.length <= 1} onClick={() => set({ items: block.items.filter((_, j) => j !== i) })}>×</button>
                  </div>
                  {def?.type === 'number' ? (
                    <label className="check">
                      <input type="checkbox" checked={it.stepper === true} onChange={(e) => set({ items: block.items.map((x, j) => (j === i ? (e.target.checked ? { ...x, stepper: true } : { field: x.field, ...(x.label ? { label: x.label } : {}) }) : x)) })} />
                      {tr('Boutons − et +', '− and + buttons')}
                    </label>
                  ) : null}
                </div>
              );
            })}
            {block.items.length < 12 && all.length ? (
              <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ items: [...block.items, { field: (all.find((f) => !block.items.some((x) => x.field === f.path)) ?? all[0]).path }] })}>
                {tr('Ajouter une pastille', 'Add a badge')}
              </button>
            ) : null}
          </div>
        );
      }
      case 'checklist':
        return <>{fieldSelect('field', linked, ['list'], { implicit: true })}{subSelect('check', tr('Case', 'Checkbox'), ['boolean'])}{subSelect('text', tr('Texte d’une ligne', 'Line text'), ['text', 'longtext'])}{localInput('label', blockTitle)}{localInput('addLabel', addBtn)}</>;
      case 'steps':
        return <>{fieldSelect('field', linked, ['textlist', 'list'])}{fieldPaths(level.fields, ['list']).some((f) => f.path === block.field) ? subSelect('text', tr('Texte d’une étape', 'Step text'), ['text', 'longtext']) : null}{localInput('label', blockTitle)}{localInput('addLabel', addBtn)}</>;
      case 'longtext':
        return <>{fieldSelect('field', linked, ['text', 'longtext'])}{localInput('label', blockTitle)}{intInput('rows', tr('Lignes (2 à 30)', 'Rows (2 to 30)'), 2, 30)}</>;
      case 'number':
        return <>{fieldSelect('field', linked, ['number'])}{localInput('label', blockTitle)}</>;
      case 'tags':
        return <>{fieldSelect('field', linked, ['tags'])}{localInput('label', blockTitle)}</>;
      case 'date':
        return <>{fieldSelect('field', linked, ['date'])}{localInput('label', blockTitle)}</>;
      case 'link':
        return <>{fieldSelect('field', linked, ['url', 'email'])}{localInput('label', blockTitle)}</>;
      case 'rating':
        return <>{fieldSelect('field', linked, ['rating', 'number'])}{localInput('label', blockTitle)}</>;
      case 'table':
        return <>{fieldSelect('field', linked, ['list'], { implicit: true })}{multi('columns', tr('Colonnes (aucune cochée : toutes)', 'Columns (none checked: all)'), itemFields(level, block.field, SCALAR).map((f) => f.key))}{localInput('label', blockTitle)}{localInput('addLabel', addBtn)}</>;
      case 'fields':
        return <>{multi('fields', tr('Champs du formulaire', 'Form fields'), fieldPaths(level.fields, SCALAR).map((f) => f.path))}{localInput('label', blockTitle)}</>;
      case 'section':
        return (
          <>
            {localInput('title', tr('Titre de la section', 'Section title'), true)}
            <label className="check"><input type="checkbox" checked={block.collapsed === true} onChange={(e) => set({ collapsed: e.target.checked || undefined })} />{tr('Repliée à l’ouverture', 'Collapsed when opened')}</label>
            <span className="hint">{tr('Ses blocs se règlent dans la composition : choisissez la section, puis un bloc de la palette.', 'Its blocks are set in the layout: choose the section, then a palette block.')}</span>
          </>
        );
      case 'cards':
        return <>{fieldSelect('field', tr('Une carte par élément de', 'One card per item of'), ['list'])}{localInput('label', blockTitle)}{localInput('addLabel', addBtn)}<span className="hint">{tr('Les blocs d’une carte visent les champs d’un élément.', 'A card’s blocks target an item’s fields.')}</span></>;
      case 'progress': {
        const numeric = block.max !== undefined || block.maxField !== undefined;
        const label = block.label ? { label: block.label } : {};
        return (
          <>
            <fieldset className="stack" style={{ ['--gap' as string]: '4px' }}>
              <legend className="label" style={{ paddingBottom: 6 }}>{tr('Mesure', 'Measure')}</legend>
              <label className="radio" style={{ fontSize: 13 }}>
                <input type="radio" name="prog" checked={!numeric} onChange={() => { const l = fieldPaths(level.fields, ['list'])[0]; onChange({ type: 'progress', ...(level.implicit || !l ? {} : { field: l.path }), ...label } as BlockDef); }} />
                {tr('Cases cochées d’une liste', 'Checked items of a list')}
              </label>
              <label className="radio" style={{ fontSize: 13 }}>
                <input type="radio" name="prog" checked={numeric} onChange={() => { const n = fieldPaths(level.fields, ['number', 'rating'])[0]; if (n) onChange({ type: 'progress', field: n.path, max: 100, ...label } as BlockDef); }} />
                {tr('Un nombre sur un maximum', 'A number out of a maximum')}
              </label>
            </fieldset>
            {numeric ? (
              <>
                {fieldSelect('field', linked, ['number', 'rating'])}
                <div className="field" style={{ gap: 6 }}>
                  <label className="label" htmlFor="p-max">{tr('Maximum', 'Maximum')}</label>
                  <input id="p-max" className="input" type="number" value={block.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value), ...(e.target.value !== '' ? { maxField: undefined } : {}) })} />
                </div>
                {fieldSelect('maxField', tr('… ou un champ maximum', '… or a maximum field'), ['number'])}
              </>
            ) : (
              <>{fieldSelect('field', linked, ['list'], { implicit: true })}{subSelect('check', tr('Case', 'Checkbox'), ['boolean'])}</>
            )}
            {localInput('label', blockTitle)}
          </>
        );
      }
      case 'total': {
        const c = block.compute;
        const lists = fieldPaths(level.fields, ['list']);
        const ofList = c.of === undefined ? [] : Array.isArray(c.of) ? c.of : [c.of];
        const scalarsHere = fieldPaths(level.fields, SCALAR).map((f) => f.path);
        const listMode = c.field !== undefined || (level.implicit !== null && (c.of === undefined || ofList.every((x) => !scalarsHere.includes(x))));
        const want: FieldType[] = c.op === 'countChecked' ? ['boolean'] : c.op === 'count' ? SCALAR : ['number', 'rating'];
        const ofOptions = listMode ? itemFields(level, c.field, want).map((f) => f.key) : fieldPaths(level.fields, want).map((f) => f.path);
        const setCompute = (patch: Record<string, unknown>) => {
          const next = { ...c } as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
            else next[k] = v;
          }
          set({ compute: next });
        };
        const ops: [string, string, string][] = [['sum', 'Somme', 'Sum'], ['avg', 'Moyenne', 'Average'], ['min', 'Minimum', 'Minimum'], ['max', 'Maximum', 'Maximum'], ['count', 'Nombre', 'Count'], ['countChecked', 'Cases cochées', 'Checked'], ['sumProduct', 'Somme des produits', 'Sum of products']];
        const many = c.op === 'sumProduct' || !listMode;
        return (
          <>
            {localInput('label', tr('Libellé', 'Label'), true)}
            <div className="field" style={{ gap: 6 }}>
              <label className="label" htmlFor="p-op">{tr('Calcul', 'Computation')}</label>
              <select id="p-op" className="select" value={c.op} onChange={(e) => setCompute({ op: e.target.value, of: undefined })}>
                {ops.map(([v, fr, en]) => <option key={v} value={v}>{lang === 'fr' ? fr : en}</option>)}
              </select>
            </div>
            <div className="field" style={{ gap: 6 }}>
              <label className="label" htmlFor="p-cf">{tr('Sur la liste', 'Over the list')}</label>
              <select id="p-cf" className="select mono" value={c.field ?? (level.implicit ? IMPLICIT : '')} onChange={(e) => setCompute({ field: e.target.value === IMPLICIT || e.target.value === '' ? undefined : e.target.value, of: undefined })}>
                {level.implicit ? <option value={IMPLICIT}>{`${level.implicit}[]`}</option> : <option value="">{tr('(champs de ce niveau)', '(fields of this level)')}</option>}
                {lists.filter((l) => l.path !== level.implicit).map((l) => <option key={l.path} value={l.path}>{`${l.path}[]`}</option>)}
              </select>
            </div>
            {c.op !== 'count' || !listMode ? (
              <fieldset className="stack" style={{ ['--gap' as string]: '4px' }}>
                <legend className="label" style={{ paddingBottom: 6 }}>{c.op === 'sumProduct' ? tr('Champs multipliés (2 à 4)', 'Multiplied fields (2 to 4)') : many ? tr('Champs combinés', 'Combined fields') : tr('Champ lu', 'Field read')}</legend>
                {ofOptions.map((o) => (
                  <label key={o} className="check mono" style={{ fontSize: 12 }}>
                    <input
                      type={many ? 'checkbox' : 'radio'}
                      name="p-of"
                      checked={ofList.includes(o)}
                      onChange={(e) => {
                        if (many) setCompute({ of: e.target.checked ? [...ofList, o] : ofList.filter((x) => x !== o) });
                        else setCompute({ of: o });
                      }}
                    />
                    {o}
                  </label>
                ))}
                {ofOptions.length === 0 ? <span className="hint">{tr('Aucun champ compatible.', 'No compatible field.')}</span> : null}
              </fieldset>
            ) : null}
            {localInput('unit', tr('Unité', 'Unit'))}
            {intInput('decimals', tr('Décimales (0 à 6)', 'Decimals (0 to 6)'), 0, 6)}
          </>
        );
      }
    }
  })();
  return (
    <div className="stack" style={{ ['--gap' as string]: '14px' }}>
      {body}
      {issues.length ? (
        <ul className="checklist" aria-live="polite">
          {issues.slice(0, 6).map((m, i) => <li key={i} style={{ color: 'var(--danger)' }}><span aria-hidden="true">✗</span>{m}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
