/**
 * store — les projets, enregistrés dans CE navigateur (IndexedDB), et nulle
 * part ailleurs : le Builder n'a pas de serveur, pas de compte, pas de
 * synchronisation. Exporter le .zip est la seule façon d'emporter un projet.
 *
 * Les réglages de confort (thème, langue, origine de Filarr pour le
 * développement) vont dans localStorage, lu prudemment : une fenêtre privée
 * peut le refuser, l'atelier marche quand même.
 */

import type { FileMap } from './project';

export interface StoredProject {
  key: string;
  createdAt: number;
  updatedAt: number;
  files: FileMap;
}

const DB = 'filarr-builder';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error ?? new Error('IndexedDB indisponible'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((ok, ko) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error ?? new Error('IndexedDB : échec'));
    });
  } finally {
    db.close();
  }
}

export const listProjects = () => tx<StoredProject[]>('readonly', (s) => s.getAll() as IDBRequest<StoredProject[]>).then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt));
export const loadProject = (key: string) => tx<StoredProject | undefined>('readonly', (s) => s.get(key) as IDBRequest<StoredProject | undefined>);
export const saveProject = (p: StoredProject) => tx('readwrite', (s) => s.put(p)).then(() => undefined);
export const deleteProject = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined);

export function newKey(): string {
  const r = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(r, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

export function getPref(name: string): string | null {
  try {
    return localStorage.getItem(`filarr-builder:${name}`);
  } catch {
    return null;
  }
}

export function setPref(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`filarr-builder:${name}`);
    else localStorage.setItem(`filarr-builder:${name}`, value);
  } catch {
    /* stockage refusé : le réglage vaut pour cette session */
  }
}
