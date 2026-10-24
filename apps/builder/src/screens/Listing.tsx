/**
 * La fiche (maquette « Fiche ») : tout ce qui est ici est SIGNÉ avec
 * l'extension et devient public. `filarr.extension.json` suit chaque
 * modification.
 *
 * Deux écarts voulus avec la maquette, imposés par le contrat : l'icône est un
 * EMOJI (manifest.icon, 1 à 8 points de code — le paquet ne transporte aucune
 * image d'icône), et les captures n'acceptent que PNG ou WebP (JPEG refusé,
 * comme Filarr le refuse).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isValidPluginIcon,
  MARKETPLACE_CATEGORIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_RELEASE_NOTES,
  MAX_SCREENSHOTS,
  readPublisherName,
  SEMVER_RE,
  sniffImage,
  validateListing,
  validateManifest,
  type MarketplaceCategory,
} from '@filarr/extension-api';
import { ProjectHeader, Skip } from '../components/ProjectHeader';
import { formatBytes } from '../lib/bytes';
import { bumpVersion, compareSemver, normalizePath } from '../lib/project';
import { reencodeScreenshot, ScreenshotError } from '../lib/screenshots';
import { usePrefs } from '../state/prefs';
import { useProject } from '../state/project';
import { go, href } from '../state/router';

const CATEGORY_NAMES: Record<MarketplaceCategory, [string, string]> = {
  editors: ['Éditeurs', 'Editors'],
  productivity: ['Productivité', 'Productivity'],
  data: ['Données', 'Data'],
  media: ['Médias', 'Media'],
  fun: ['Divertissement', 'Fun'],
  other: ['Autre', 'Other'],
};
const LICENSES: { v: string; fr: string; en: string }[] = [
  { v: 'MIT', fr: 'MIT', en: 'MIT' },
  { v: 'Apache-2.0', fr: 'Apache-2.0', en: 'Apache-2.0' },
  { v: 'GPL-3.0', fr: 'GPL-3.0', en: 'GPL-3.0' },
  { v: 'Proprietary', fr: 'Propriétaire', en: 'Proprietary' },
];
const EMOJIS = ['🍲', '📝', '🧩', '🔢', '🗂️', '⛰️', '📊', '📅', '✅', '🛒', '📚', '🎵', '🎬', '🖼️', '✏️', '🎲', '🧪', '🌦️', '⏳', '🗺️', '📦', '🧾', '💡', '🔖', '🎨', '📈', '🧭', '🐙', '📌', '🪴', '🍷', '🗒️'];

/** Les initiales du nom, en repli quand l'icône manque. */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').slice(0, 2) || '?';

function Shot({ bytes, label }: { bytes: Uint8Array; label: string }) {
  const url = useMemo(() => {
    const mime = sniffImage(bytes)?.mime ?? 'image/webp';
    return URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
  }, [bytes]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={label} />;
}

export function ListingScreen() {
  const { tr, lang } = usePrefs();
  const { key, files, setFiles, project, updateProject, meta, setMeta, check, mode } = useProject();
  const [iconOpen, setIconOpen] = useState(false);
  const [iconDraft, setIconDraft] = useState('');
  const [shotError, setShotError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState<Record<string, number>>({});
  const shotInput = useRef<HTMLInputElement>(null);

  if (!project) {
    return (
      <div className="app">
        <ProjectHeader screen="fiche" />
        <main className="page"><p className="banner banner-err">{tr('filarr.extension.json est illisible : corrigez-le dans l’atelier.', 'filarr.extension.json is unreadable: fix it in the workshop.')}</p></main>
      </div>
    );
  }
  const m = project.manifest as unknown as Record<string, unknown>;
  const listing = (project.listing ?? {}) as Record<string, unknown>;
  const name = String(m.name ?? '');
  const desc = typeof m.description === 'string' ? m.description : '';
  const version = String(m.version ?? '');
  const icon = typeof m.icon === 'string' ? m.icon : '';
  const author = typeof m.author === 'string' ? m.author : '';
  const shots = project.screenshots;
  const last = meta.lastPublished;
  const base = last && SEMVER_RE.test(last) ? last : version;

  const setManifest = (patch: Record<string, unknown>) =>
    updateProject((raw) => {
      const man = raw.manifest as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete man[k];
        else man[k] = v;
      }
    });
  const setListing = (patch: Record<string, unknown>) =>
    updateProject((raw) => {
      const l = { ...((raw.listing as Record<string, unknown>) ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete l[k];
        else l[k] = v;
      }
      if (Object.keys(l).length) raw.listing = l;
      else delete raw.listing;
    });

  const addShot = async (file: File) => {
    setShotError(null);
    if (shots.length >= MAX_SCREENSHOTS) return;
    setBusy(true);
    try {
      const out = await reencodeScreenshot(new Uint8Array(await file.arrayBuffer()));
      let n = 1;
      while (files[`captures/${n}.webp`] || shots.includes(`captures/${n}.webp`)) n++;
      const path = normalizePath(`captures/${n}.webp`) as string;
      setFiles((f) => ({ ...f, [path]: out.bytes }));
      updateProject((raw) => {
        raw.screenshots = [...((raw.screenshots as string[]) ?? []), path];
      });
      setOrigin((o) => ({ ...o, [path]: out.originalBytes }));
    } catch (e) {
      const code = e instanceof ScreenshotError ? e.code : 'decode';
      setShotError(
        code === 'jpeg'
          ? tr('JPEG refusé : Filarr n’accepte que PNG ou WebP en aperçu. Exportez la capture en PNG.', 'JPEG refused: Filarr only accepts PNG or WebP previews. Export the screenshot as PNG.')
          : code === 'type'
            ? tr('Ni PNG, ni WebP (le type est lu dans les octets du fichier, pas dans son nom).', 'Neither PNG nor WebP (the type is read from the file’s bytes, not its name).')
            : code === 'too_large'
              ? tr('Impossible de la faire tenir sous 96 Kio, même réduite.', 'Cannot fit it under 96 KiB, even scaled down.')
              : tr('Image illisible.', 'Unreadable image.')
      );
    } finally {
      setBusy(false);
    }
  };
  const moveShot = (i: number, d: -1 | 1) =>
    updateProject((raw) => {
      const s = [...((raw.screenshots as string[]) ?? [])];
      const j = i + d;
      if (j < 0 || j >= s.length) return;
      [s[i], s[j]] = [s[j], s[i]];
      raw.screenshots = s;
    });
  const removeShot = (i: number) => {
    const path = shots[i];
    updateProject((raw) => {
      raw.screenshots = ((raw.screenshots as string[]) ?? []).filter((_, j) => j !== i);
    });
    setFiles((f) => {
      const next = { ...f };
      if (path.startsWith('captures/')) delete next[path];
      return next;
    });
  };

  // ── Les contrôles de la fiche ───────────────────────────────────────────
  const mv = validateManifest(project.manifest);
  const lv = validateListing(project.listing);
  const lines: { level: 'ok' | 'warning' | 'error'; text: string }[] = [];
  const errs = [...mv.issues, ...lv].filter((i) => i.level === 'error');
  if (errs.length === 0) lines.push({ level: 'ok', text: tr('Manifeste conforme au schéma de Filarr', 'Manifest matches Filarr’s schema') });
  for (const e of errs) lines.push({ level: 'error', text: e.message });
  if (last) {
    if (SEMVER_RE.test(version) && compareSemver(version, last) > 0) lines.push({ level: 'ok', text: tr(`Version nouvelle et supérieure à ${last}`, `New version, higher than ${last}`) });
    else lines.push({ level: 'error', text: tr(`La version doit dépasser ${last}, la dernière publiée`, `The version must be higher than ${last}, the last published`) });
  } else lines.push({ level: 'warning', text: tr('Dernière version publiée inconnue : si l’extension existe déjà, indiquez-la pour que le Builder vérifie la suivante', 'Last published version unknown: if the extension already exists, enter it so the Builder checks the next one') });
  for (const w of mv.issues.filter((i) => i.level === 'warning')) lines.push({ level: 'warning', text: w.message });
  if (!icon) lines.push({ level: 'warning', text: tr('Pas d’icône : choisissez un emoji', 'No icon: choose an emoji') });
  if (shots.length === 0) lines.push({ level: 'warning', text: tr('Aucune capture : la fiche n’aura rien à montrer', 'No screenshot: the listing will have nothing to show') });
  else if (shots.length < MAX_SCREENSHOTS) lines.push({ level: 'warning', text: tr(`${MAX_SCREENSHOTS - shots.length === 1 ? 'Une capture sur quatre est encore vide' : `${MAX_SCREENSHOTS - shots.length} captures sur quatre sont encore vides`}`, `${MAX_SCREENSHOTS - shots.length} of four screenshots still empty`) });
  for (const l of check.report.lines.filter((x) => x.level === 'error' && /^screenshot/.test(x.code))) lines.push({ level: 'error', text: l.message });
  if (!listing.license) lines.push({ level: 'warning', text: tr('Aucune licence déclarée', 'No license declared') });
  const remarks = lines.filter((l) => l.level !== 'ok').length;
  const blocking = lines.some((l) => l.level === 'error');
  const status = !name.trim() ? tr('Le nom est requis', 'The name is required') : blocking ? tr('À corriger', 'To fix') : remarks ? tr(`Fiche prête · ${remarks} remarque${remarks > 1 ? 's' : ''}`, `Listing ready · ${remarks} remark${remarks > 1 ? 's' : ''}`) : tr('Fiche prête', 'Listing ready');
  const descShort = desc.length > 96 ? `${desc.slice(0, 95)}…` : desc;
  const notes = typeof listing.releaseNotes === 'string' ? listing.releaseNotes : '';
  const lic = typeof listing.license === 'string' ? listing.license : '';
  const licKnown = LICENSES.some((l) => l.v === lic);
  const catName = (c: unknown) => (typeof c === 'string' && c in CATEGORY_NAMES ? CATEGORY_NAMES[c as MarketplaceCategory][lang === 'fr' ? 0 : 1] : tr('Sans catégorie', 'Uncategorized'));
  const sourceOk = !listing.sourceUrl || !lv.some((i) => i.field === 'listing.sourceUrl');
  const authorOk = !author || readPublisherName(author) !== null;
  const iconOk = !icon || isValidPluginIcon(icon);

  return (
    <div className="app">
      <Skip />
      <ProjectHeader screen="fiche" end={<span className="saved" style={{ color: !name.trim() || blocking ? 'var(--danger)' : 'var(--muted)' }} aria-live="polite">{status}</span>} />
      <main id="contenu" className="page" style={{ maxWidth: 1280 }}>
        <div className="split">
          <form className="main" onSubmit={(e) => e.preventDefault()}>
            <div className="stack" style={{ ['--gap' as string]: '8px' }}>
              <h1>{tr('La fiche', 'The listing')}</h1>
              <p className="lead">
                {tr('Tout ce qui est ici est signé avec l’extension et devient public. Le fichier', 'Everything here is signed with the extension and becomes public. The file')} <code>filarr.extension.json</code> {tr('suit vos modifications.', 'follows your changes.')}
              </p>
            </div>

            <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
              <div className="stack" style={{ ['--gap' as string]: '8px', width: 180 }}>
                <span className="label">{tr('Icône', 'Icon')}</span>
                <button type="button" className="icon-pick" aria-label={tr(`Choisir une icône (actuelle : ${icon || 'aucune'})`, `Choose an icon (current: ${icon || 'none'})`)} aria-expanded={iconOpen} onClick={() => { setIconOpen((v) => !v); setIconDraft(icon); }}>
                  {icon || <span style={{ fontSize: 20, fontWeight: 650, color: 'var(--accent)' }}>{initials(name)}</span>}
                </button>
                <span className="hint">{tr('Un emoji, 1 à 8 points de code. Le paquet ne transporte aucune image d’icône.', 'An emoji, 1 to 8 code points. The package carries no icon image.')}</span>
                {!iconOk ? <span className="err">{tr('Icône refusée : un emoji seulement.', 'Icon refused: an emoji only.')}</span> : null}
              </div>
              <div className="stack" style={{ flex: '1 1 320px', ['--gap' as string]: '16px' }}>
                <div className="field">
                  <label htmlFor="f-name">{tr('Nom', 'Name')}</label>
                  <input id="f-name" className="input" value={name} maxLength={100} aria-invalid={!name.trim()} onChange={(e) => setManifest({ name: e.target.value })} />
                </div>
                <div className="grid-auto" style={{ ['--min' as string]: '200px' }}>
                  <div className="field">
                    <label htmlFor="f-cat">{tr('Catégorie', 'Category')}</label>
                    <select id="f-cat" className="select" value={typeof m.category === 'string' ? m.category : ''} onChange={(e) => setManifest({ category: e.target.value || undefined })}>
                      <option value="">{tr('(aucune)', '(none)')}</option>
                      {MARKETPLACE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_NAMES[c][lang === 'fr' ? 0 : 1]}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="f-author">{tr('Nom publié', 'Published name')}</label>
                    <input id="f-author" className="input" value={author} aria-invalid={!authorOk} aria-describedby="f-author-h" onChange={(e) => setManifest({ author: e.target.value === '' ? undefined : e.target.value })} />
                    <span id="f-author-h" className={authorOk ? 'hint' : 'err'}>{tr('Un pseudonyme : signé, il ne prouve rien.', 'A pseudonym: signed, it proves nothing.')}</span>
                  </div>
                </div>
              </div>
            </div>
            {iconOpen ? (
              <div className="card" role="group" aria-label={tr('Choisir une icône', 'Choose an icon')}>
                <div className="row" style={{ gap: 8 }}>
                  <label className="sr-only" htmlFor="f-icon">{tr('Emoji', 'Emoji')}</label>
                  <input id="f-icon" className="input" style={{ width: 120, fontSize: 22 }} value={iconDraft} onChange={(e) => setIconDraft(e.target.value)} placeholder="🙂" />
                  <button type="button" className="btn" disabled={!isValidPluginIcon(iconDraft)} onClick={() => { setManifest({ icon: iconDraft }); setIconOpen(false); }}>{tr('Utiliser', 'Use')}</button>
                  {icon ? <button type="button" className="link-btn" onClick={() => { setManifest({ icon: undefined }); setIconOpen(false); }}>{tr('Retirer l’icône', 'Remove the icon')}</button> : null}
                  {iconDraft && !isValidPluginIcon(iconDraft) ? <span className="err">{tr('Un emoji, 1 à 8 points de code, sans texte.', 'An emoji, 1 to 8 code points, no text.')}</span> : null}
                </div>
                <div className="emoji-grid">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" aria-label={e} aria-pressed={icon === e} onClick={() => { setManifest({ icon: e }); setIconOpen(false); }}>{e}</button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="f-desc">{tr('Description', 'Description')}</label>
              <textarea id="f-desc" className="textarea" rows={3} value={desc} maxLength={MAX_DESCRIPTION_LENGTH} aria-describedby="f-desc-c" onChange={(e) => setManifest({ description: e.target.value.slice(0, MAX_DESCRIPTION_LENGTH) })} />
              <span id="f-desc-c" className="hint" style={{ alignSelf: 'flex-end' }}>{desc.length} / {MAX_DESCRIPTION_LENGTH}</span>
            </div>

            <div className="stack" style={{ ['--gap' as string]: '10px' }}>
              <span className="label">{tr('Captures d’écran', 'Screenshots')}</span>
              <div className="shots">
                {Array.from({ length: MAX_SCREENSHOTS }, (_, i) => {
                  const path = shots[i];
                  const bytes = path ? files[path] : undefined;
                  if (path && bytes) {
                    const info = sniffImage(bytes);
                    return (
                      <div key={path} className="shot">
                        <div className="shot-box"><Shot bytes={bytes} label={tr(`Capture ${i + 1}`, `Screenshot ${i + 1}`)} /></div>
                        <span className="shot-meta">
                          {path.split('/').pop()} · {info?.mime.replace('image/', '').toUpperCase()} · {formatBytes(bytes.byteLength, lang)}
                          {origin[path] ? ` · ${tr('depuis', 'from')} ${formatBytes(origin[path], lang)}` : ''}
                        </span>
                        <div className="row" style={{ gap: 2 }}>
                          <button type="button" className="icon-btn" disabled={i === 0} aria-label={tr(`Avancer la capture ${i + 1}`, `Move screenshot ${i + 1} earlier`)} onClick={() => moveShot(i, -1)}>←</button>
                          <button type="button" className="icon-btn" disabled={i === shots.length - 1} aria-label={tr(`Reculer la capture ${i + 1}`, `Move screenshot ${i + 1} later`)} onClick={() => moveShot(i, 1)}>→</button>
                          <button type="button" className="link-btn" style={{ fontSize: 12 }} onClick={() => removeShot(i)}>{tr('Retirer', 'Remove')}</button>
                        </div>
                      </div>
                    );
                  }
                  if (path && !bytes) {
                    return (
                      <div key={`m-${i}`} className="shot">
                        <div className="shot-box empty"><span className="err" style={{ fontSize: 12, padding: 8 }}>{tr(`Introuvable : ${path}`, `Missing: ${path}`)}</span></div>
                        <button type="button" className="link-btn" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => removeShot(i)}>{tr('Retirer', 'Remove')}</button>
                      </div>
                    );
                  }
                  const firstEmpty = i === shots.length;
                  return (
                    <div key={`e-${i}`} className="shot">
                      <div className="shot-box empty">
                        {firstEmpty ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => shotInput.current?.click()}>{busy ? tr('Conversion…', 'Converting…') : tr('Ajouter', 'Add')}</button> : null}
                      </div>
                      <span className="shot-meta">{firstEmpty ? tr('PNG ou WebP', 'PNG or WebP') : ''}</span>
                    </div>
                  );
                })}
              </div>
              <input ref={shotInput} type="file" hidden accept="image/png,image/webp" data-testid="shot-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addShot(f); }} />
              {shotError ? <span className="err" role="alert">{shotError}</span> : null}
              <span className="hint">{tr('Jusqu’à 4. Le Builder les convertit en WebP pour tenir sous 96 Kio chacune (et retire leurs métadonnées). JPEG refusé.', 'Up to 4. The Builder converts them to WebP to fit under 96 KiB each (and strips their metadata). JPEG refused.')}</span>
            </div>

            <fieldset className="stack" style={{ ['--gap' as string]: '10px' }}>
              <legend>
                {tr('Version à publier', 'Version to publish')} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>· {tr('dernière publiée', 'last published')} : {last ?? tr('inconnue', 'unknown')}</span>
              </legend>
              <div role="group" aria-label={tr('Type de version', 'Kind of version')} className="bumps">
                {(['patch', 'minor', 'major'] as const).map((k) => {
                  const v = last ? bumpVersion(base, k) : k === 'patch' ? version : bumpVersion(base, k);
                  return (
                    <button key={k} type="button" className="bump" aria-pressed={version === v} onClick={() => setManifest({ version: v })}>
                      <span className="v">{v}</span>
                      <span className="l">{k === 'patch' ? (last ? tr('Correctif', 'Fix') : tr('Telle quelle', 'As is')) : k === 'minor' ? tr('Nouveautés', 'New features') : tr('Changement majeur', 'Major change')}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid-auto" style={{ ['--min' as string]: '200px' }}>
                <div className="field">
                  <label htmlFor="f-ver" style={{ fontSize: 13 }}>{tr('Version exacte', 'Exact version')}</label>
                  <input id="f-ver" className="input mono input-sm" value={version} aria-invalid={!SEMVER_RE.test(version)} onChange={(e) => setManifest({ version: e.target.value.trim() })} />
                </div>
                <div className="field">
                  <label htmlFor="f-last" style={{ fontSize: 13 }}>{tr('Dernière version publiée (si elle existe)', 'Last published version (if any)')}</label>
                  <input id="f-last" className="input mono input-sm" value={last ?? ''} placeholder="2.3.0" onChange={(e) => setMeta((mm) => { const v = e.target.value.trim(); const { lastPublished: _l, ...rest } = mm; return v ? { ...rest, lastPublished: v } : rest; })} />
                </div>
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="f-notes">{tr('Nouveautés de cette version', 'What’s new in this version')}</label>
              <textarea id="f-notes" className="textarea" rows={3} value={notes} maxLength={MAX_RELEASE_NOTES} onChange={(e) => setListing({ releaseNotes: e.target.value.slice(0, MAX_RELEASE_NOTES) })} />
            </div>

            <div className="grid-auto">
              <div className="field">
                <label htmlFor="f-src">{tr('Code source', 'Source code')}</label>
                <input id="f-src" className="input" type="url" placeholder="https://…" value={String(listing.sourceUrl ?? '')} maxLength={300} aria-invalid={!sourceOk} aria-describedby="f-src-h" onChange={(e) => setListing({ sourceUrl: e.target.value.trim() })} />
                <span id="f-src-h" className={sourceOk ? 'hint' : 'err'}>{tr('https:// seulement, 300 caractères au plus.', 'https:// only, at most 300 characters.')}</span>
              </div>
              <div className="field">
                <label htmlFor="f-lic">{tr('Licence', 'License')}</label>
                <select id="f-lic" className="select" value={licKnown ? lic : lic ? 'autre' : ''} onChange={(e) => setListing({ license: e.target.value === 'autre' ? (lic && !licKnown ? lic : 'BSD-3-Clause') : e.target.value })}>
                  <option value="">{tr('(aucune)', '(none)')}</option>
                  {LICENSES.map((l) => <option key={l.v} value={l.v}>{lang === 'fr' ? l.fr : l.en}</option>)}
                  <option value="autre">{tr('Autre…', 'Other…')}</option>
                </select>
                {lic && !licKnown ? <input className="input input-sm" aria-label={tr('Licence (texte)', 'License (text)')} value={lic} maxLength={40} onChange={(e) => setListing({ license: e.target.value })} /> : null}
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary btn-md" onClick={() => go(href(key, mode === 'nocode' ? 'publier' : 'essai'))}>
                {mode === 'nocode' ? tr('Suivant : publier', 'Next: publish') : tr('Suivant : code et essai', 'Next: code and try')}
              </button>
            </div>
          </form>

          <aside aria-labelledby="pv-t" className="side" style={{ flexBasis: 360 }}>
            <h2 id="pv-t" className="section-title">{tr('Ce que verront les gens', 'What people will see')}</h2>
            <span className="sub-label">{tr('Carte du catalogue', 'Catalog card')}</span>
            <article className="market-card" aria-label={tr('Aperçu de la carte du catalogue', 'Catalog card preview')}>
              <div className="market-head">
                <span aria-hidden="true" className="market-icon">{icon || initials(name)}</span>
                <div className="stack" style={{ ['--gap' as string]: '0px', minWidth: 0 }}>
                  <span className="market-name">{name || tr('(sans nom)', '(no name)')}</span>
                  <span className="market-by">{author || tr('(nom publié)', '(published name)')}</span>
                </div>
              </div>
              <p className="market-desc">{descShort || tr('(aucune description)', '(no description)')}</p>
              <div className="exts">{(project.manifest.extensions ?? []).map((e) => <span key={e}>.{e}</span>)}</div>
              <div className="market-foot">
                <span>{catName(m.category)} · v{version}</span>
                <span className="market-install">{tr('Installer', 'Install')}</span>
              </div>
            </article>
            <span className="sub-label">{tr('Haut de la fiche', 'Top of the listing')}</span>
            <div className="market-card">
              <div className="market-head">
                <span aria-hidden="true" className="market-icon" style={{ width: 56, height: 56, fontSize: 30 }}>{icon || initials(name)}</span>
                <div className="stack" style={{ ['--gap' as string]: '0px', minWidth: 0 }}>
                  <span className="market-name" style={{ fontSize: 18 }}>{name || tr('(sans nom)', '(no name)')}</span>
                  <span className="market-by">{author || tr('(nom publié)', '(published name)')} · {tr('version', 'version')} {version}</span>
                </div>
              </div>
              {notes ? (
                <div className="stack" style={{ ['--gap' as string]: '2px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tr(`Nouveautés de la ${version}`, `What’s new in ${version}`)}</span>
                  <span className="market-desc">{notes.replace(/\s*\n\s*-?\s*/g, ' · ').replace(/^-\s*/, '').slice(0, 160)}{notes.length > 160 ? '…' : ''}</span>
                </div>
              ) : null}
              {shots.length ? (
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                  {shots.slice(0, 3).map((p) => (files[p] ? <div key={p} className="shot-box" style={{ width: 110, flex: '0 0 110px' }}><Shot bytes={files[p]} label="" /></div> : null))}
                </div>
              ) : null}
            </div>
            <ul className="checklist" aria-label={tr('Contrôles de la fiche', 'Listing checks')}>
              {lines.map((l, i) => (
                <li key={i} style={{ color: l.level === 'error' ? 'var(--danger)' : l.level === 'warning' ? 'var(--warn-text)' : undefined }}>
                  <span aria-hidden="true" className={l.level === 'ok' ? 'sym-ok' : l.level === 'warning' ? 'sym-warn' : 'sym-err'}>{l.level === 'ok' ? '✓' : l.level === 'warning' ? '!' : '✗'}</span>
                  {l.text}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
