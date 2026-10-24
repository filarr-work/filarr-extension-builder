/**
 * router — des adresses dans le fragment (`#/p/<projet>/vue`) : un site
 * statique sans réécriture côté serveur, et un seul document HTML, celui que
 * protège la CSP de l'atelier.
 */

import { useEffect, useState } from 'react';

export type Screen = 'modele' | 'donnees' | 'vue' | 'essai' | 'fiche' | 'publier';
export const SCREENS: Screen[] = ['modele', 'donnees', 'vue', 'essai', 'fiche', 'publier'];

export type Route = { name: 'home' } | { name: 'project'; key: string; screen: Screen };

export function parseHash(hash: string): Route {
  const m = /^#\/p\/([a-z0-9]{4,32})(?:\/([a-z]+))?\/?$/.exec(hash);
  if (m) {
    const screen = (SCREENS as string[]).includes(m[2] ?? '') ? (m[2] as Screen) : 'essai';
    return { name: 'project', key: m[1], screen };
  }
  return { name: 'home' };
}

export const href = (key: string, screen: Screen) => `#/p/${key}/${screen}`;

export function go(to: string): void {
  if (location.hash !== to) location.hash = to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
