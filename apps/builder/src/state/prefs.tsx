/**
 * prefs — langue (français par défaut, anglais disponible) et thème (celui du
 * système, ou forcé). Chaque texte de l'interface s'écrit `tr('…', '…')` : le
 * français et l'anglais côte à côte, pour qu'aucune chaîne ne reste sans
 * traduction.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getPref, setPref } from '../lib/store';

export type Lang = 'fr' | 'en';
export type ThemePref = 'auto' | 'light' | 'dark';

interface Prefs {
  lang: Lang;
  setLang(l: Lang): void;
  theme: ThemePref;
  setTheme(t: ThemePref): void;
  /** Le thème effectif (pour le simulateur, qui suit l'atelier par défaut). */
  scheme: 'light' | 'dark';
  tr(fr: string, en: string): string;
}

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (getPref('lang') === 'en' ? 'en' : 'fr'));
  const [theme, setThemeState] = useState<ThemePref>(() => {
    const t = getPref('theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setPref('lang', l);
  }, []);
  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    setPref('theme', t === 'auto' ? null : t);
  }, []);
  const tr = useCallback((fr: string, en: string) => (lang === 'en' ? en : fr), [lang]);
  const value = useMemo<Prefs>(
    () => ({ lang, setLang, theme, setTheme, scheme: theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme, tr }),
    [lang, setLang, theme, setTheme, systemDark, tr]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error('PrefsProvider manquant');
  return v;
}
