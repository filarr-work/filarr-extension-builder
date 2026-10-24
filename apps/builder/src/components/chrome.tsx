/**
 * chrome — ce que partagent les écrans : la barre du haut (marque, projet,
 * étapes, actions, langue et thème), la boîte de dialogue, le rapport des
 * contrôles et le téléchargement.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReportLine } from '@filarr-cli/report';
import { usePrefs, type ThemePref } from '../state/prefs';
import { href, type Screen } from '../state/router';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M8 9h8M8 13h5M8 17h3" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/">
      <Logo />
      Filarr Builder
    </a>
  );
}

export function PrefsControls() {
  const { lang, setLang, theme, setTheme, tr } = usePrefs();
  return (
    <span className="prefs">
      <label className="sr-only" htmlFor="pref-lang">
        {tr('Langue', 'Language')}
      </label>
      <select id="pref-lang" value={lang} onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'fr')}>
        <option value="fr">FR</option>
        <option value="en">EN</option>
      </select>
      <label className="sr-only" htmlFor="pref-theme">
        {tr('Thème', 'Theme')}
      </label>
      <select id="pref-theme" value={theme} onChange={(e) => setTheme(e.target.value as ThemePref)}>
        <option value="auto">{tr('Thème du système', 'System theme')}</option>
        <option value="light">{tr('Clair', 'Light')}</option>
        <option value="dark">{tr('Sombre', 'Dark')}</option>
      </select>
    </span>
  );
}

export interface StepDef {
  screen: Screen;
  label: string;
  done?: boolean;
}

export function stepsFor(mode: 'code' | 'nocode', tr: (fr: string, en: string) => string): StepDef[] {
  return mode === 'nocode'
    ? [
        { screen: 'donnees', label: tr('Données', 'Data') },
        { screen: 'vue', label: tr('Vue et style', 'View and style') },
        { screen: 'essai', label: tr('Essai', 'Try') },
        { screen: 'fiche', label: tr('Fiche', 'Listing') },
        { screen: 'publier', label: tr('Publier', 'Publish') },
      ]
    : [
        { screen: 'modele', label: tr('Modèle', 'Template') },
        { screen: 'fiche', label: tr('Fiche', 'Listing') },
        { screen: 'essai', label: tr('Code et essai', 'Code and try') },
        { screen: 'publier', label: tr('Publier', 'Publish') },
      ];
}

/** Les étapes en ligne, comme dans la barre des maquettes. */
export function InlineSteps({ storeKey, mode, current, numbered }: { storeKey: string; mode: 'code' | 'nocode'; current: Screen; numbered: boolean }) {
  const { tr } = usePrefs();
  return (
    <nav aria-label={tr('Étapes', 'Steps')} className="steps-inline">
      {stepsFor(mode, tr).map((s, i) => (
        <a key={s.screen} href={href(storeKey, s.screen)} aria-current={s.screen === current ? 'page' : undefined}>
          {numbered ? `${i + 1} ` : ''}
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export function TopBar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  return (
    <header className="topbar">
      <Brand />
      {children}
      <span className="topbar-end">
        {end}
        <PrefsControls />
      </span>
    </header>
  );
}

/** Une boîte modale native : le focus, Échap et le fond sont ceux du navigateur. */
export function Modal({ open, onClose, title, children, labelledBy }: { open: boolean; onClose(): void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const id = labelledBy ?? `modal-${title.replace(/\W+/g, '-')}`;
  return (
    <dialog ref={ref} className="modal" aria-labelledby={id} onClose={onClose} onCancel={onClose}>
      <h2 id={id}>{title}</h2>
      {open ? children : null}
    </dialog>
  );
}

export function symbol(level: ReportLine['level']): ReactNode {
  if (level === 'ok') return <span aria-hidden="true" className="sym-ok">✓</span>;
  if (level === 'warning') return <span aria-hidden="true" className="sym-warn">!</span>;
  return <span aria-hidden="true" className="sym-err">✗</span>;
}

/** Les lignes d'un rapport, du plus grave au moins grave, comme `filarr-ext check`. */
export function ReportList({ lines, onlyProblems = false, limit }: { lines: ReportLine[]; onlyProblems?: boolean; limit?: number }) {
  const { tr } = usePrefs();
  const order = { error: 0, warning: 1, ok: 2 } as const;
  const shown = [...lines].filter((l) => !onlyProblems || l.level !== 'ok').sort((a, b) => order[a.level] - order[b.level]).slice(0, limit ?? lines.length);
  const word = { ok: tr('réussi', 'passed'), warning: tr('à regarder', 'to review'), error: tr('erreur', 'error') };
  return (
    <ul>
      {shown.map((l, i) => (
        <li key={`${l.code}-${i}`} className={l.level === 'ok' ? '' : l.level === 'warning' ? 'warn' : 'error'}>
          {symbol(l.level)}
          <span className="sr-only">{word[l.level]} : </span>
          <span>
            {l.message}
            {l.field ? <span className="where"> [{l.field}]</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function summaryOf(lines: ReportLine[], tr: (fr: string, en: string) => string): { text: string; level: 'ok' | 'warning' | 'error' } {
  const ok = lines.filter((l) => l.level === 'ok').length;
  const w = lines.filter((l) => l.level === 'warning').length;
  const e = lines.filter((l) => l.level === 'error').length;
  const parts = [tr(`${ok} réussi${ok > 1 ? 's' : ''}`, `${ok} passed`)];
  if (w) parts.push(tr(`${w} à regarder`, `${w} to review`));
  if (e) parts.push(tr(`${e} erreur${e > 1 ? 's' : ''}`, `${e} error${e > 1 ? 's' : ''}`));
  return { text: parts.join(' · '), level: e ? 'error' : w ? 'warning' : 'ok' };
}

export function download(bytes: Uint8Array, name: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** « il y a 2 s » */
export function ago(at: number, now: number, tr: (fr: string, en: string) => string): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return tr(`il y a ${s} s`, `${s} s ago`);
  const m = Math.round(s / 60);
  return tr(`il y a ${m} min`, `${m} min ago`);
}

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, setNow]);
  return now;
}
