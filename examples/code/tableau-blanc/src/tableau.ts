/**
 * tableau — le FORMAT `.tableau` (JSON) et son image dans un `Y.Doc`.
 *
 * Le fichier reste du JSON lisible ; le `Y.Doc` n'existe que le temps de
 * l'ouverture, pour la co-édition. Deux conversions, et aucune autre :
 *
 *  - le semis (`salle.ts`) : le fichier devient le contenu du document Yjs ;
 *  - `depuisDoc(doc)` : le document Yjs redevient un tableau, sérialisé par
 *    `ecrireTableau`.
 *
 * LA FORME DU Y.DOC, choisie pour la co-édition :
 *
 *  - une `Y.Map` `elements`, de l'identifiant vers un objet SIMPLE (immuable :
 *    on remplace, on ne modifie pas) ;
 *  - l'ordre d'affichage n'est PAS l'ordre de la map (qui dépend de l'ordre
 *    d'arrivée des updates, différent chez chaque pair) : il est porté par `z`,
 *    départagé par `id`. Deux pairs qui ont reçu les mêmes updates écrivent
 *    donc les mêmes octets ;
 *  - semer deux fois le même fichier (deux pages qui sèment une salle vide en
 *    même temps) pose deux fois les MÊMES clés aux mêmes valeurs : le résultat
 *    est identique à un seul semis, sans doublon.
 */

import * as Y from 'yjs';

export const FORMAT = 'filarr-tableau';
export const VERSION = 1;
export const LARGEUR = 1600;
export const HAUTEUR = 1000;
export const ELEMENTS_MAX = 5000;
export const POINTS_MAX = 5000;
export const TEXTE_MAX = 500;

export interface Trait {
  id: string;
  type: 'trait';
  z: number;
  couleur: string;
  epaisseur: number;
  points: number[];
}

export interface Texte {
  id: string;
  type: 'texte';
  z: number;
  couleur: string;
  x: number;
  y: number;
  texte: string;
}

export type Element = Trait | Texte;

export interface Tableau {
  largeur: number;
  hauteur: number;
  elements: Element[];
}

export type Lecture = { ok: true; tableau: Tableau; repare: boolean } | { ok: false; raison: 'json' | 'format' | { version: number } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COULEUR_RE = /^#[0-9a-f]{6}$/;
const arrondi = (v: number) => Math.round(v * 10) / 10;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function tableauVide(): Tableau {
  return { largeur: LARGEUR, hauteur: HAUTEUR, elements: [] };
}

/** L'ordre d'affichage, le même chez tous les pairs. */
export function ordonner(elements: Element[]): Element[] {
  return [...elements].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Un élément venu d'un fichier ou d'un pair : chaque champ est vérifié et borné. */
export function lireElement(brut: unknown, l = LARGEUR, h = HAUTEUR): Element | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const e = brut as Record<string, unknown>;
  if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return null;
  const z = typeof e.z === 'number' && Number.isFinite(e.z) ? e.z : 0;
  const couleur = typeof e.couleur === 'string' && COULEUR_RE.test(e.couleur) ? e.couleur : '#1f2937';
  if (e.type === 'trait') {
    if (!Array.isArray(e.points)) return null;
    const points: number[] = [];
    for (let i = 0; i + 1 < Math.min(e.points.length, POINTS_MAX * 2); i += 2) {
      const x = e.points[i];
      const y = e.points[i + 1];
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push(borner(arrondi(x), 0, l), borner(arrondi(y), 0, h));
    }
    if (points.length === 0) return null;
    const ep = typeof e.epaisseur === 'number' && Number.isFinite(e.epaisseur) ? borner(Math.round(e.epaisseur), 1, 32) : 4;
    return { id: e.id, type: 'trait', z, couleur, epaisseur: ep, points };
  }
  if (e.type === 'texte') {
    const x = typeof e.x === 'number' && Number.isFinite(e.x) ? borner(arrondi(e.x), 0, l) : 0;
    const y = typeof e.y === 'number' && Number.isFinite(e.y) ? borner(arrondi(e.y), 0, h) : 0;
    const texte = typeof e.texte === 'string' ? e.texte.replace(/[\r\n]+/g, ' ').slice(0, TEXTE_MAX) : '';
    return { id: e.id, type: 'texte', z, couleur, x, y, texte };
  }
  return null;
}

export function lireTableau(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, tableau: tableauVide(), repare: false };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    return { ok: false, raison: 'json' };
  }
  if (typeof brut !== 'object' || brut === null || (brut as { format?: unknown }).format !== FORMAT) {
    return { ok: false, raison: 'format' };
  }
  const b = brut as Record<string, unknown>;
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.elements)) return { ok: false, raison: 'format' };
  const largeur = typeof b.largeur === 'number' && Number.isInteger(b.largeur) && b.largeur >= 100 && b.largeur <= 8000 ? b.largeur : LARGEUR;
  const hauteur = typeof b.hauteur === 'number' && Number.isInteger(b.hauteur) && b.hauteur >= 100 && b.hauteur <= 8000 ? b.hauteur : HAUTEUR;
  let repare = largeur !== b.largeur || hauteur !== b.hauteur || b.elements.length > ELEMENTS_MAX;
  const vus = new Set<string>();
  const elements: Element[] = [];
  for (const e of b.elements.slice(0, ELEMENTS_MAX)) {
    const lu = lireElement(e, largeur, hauteur);
    if (!lu || vus.has(lu.id)) {
      repare = true;
      continue;
    }
    vus.add(lu.id);
    if (JSON.stringify(lu) !== JSON.stringify(e)) repare = true;
    elements.push(lu);
  }
  return { ok: true, tableau: { largeur, hauteur, elements: ordonner(elements) }, repare };
}

function propre(e: Element): Element {
  return e.type === 'trait'
    ? { id: e.id, type: 'trait', z: e.z, couleur: e.couleur, epaisseur: e.epaisseur, points: e.points }
    : { id: e.id, type: 'texte', z: e.z, couleur: e.couleur, x: e.x, y: e.y, texte: e.texte };
}

/** Un élément par ligne : un tableau se compare élément par élément. */
export function ecrireTableau(t: Tableau): Uint8Array {
  const tete = JSON.stringify({ format: FORMAT, version: VERSION, largeur: t.largeur, hauteur: t.hauteur });
  const lignes = ordonner(t.elements).map((e) => JSON.stringify(propre(e)));
  const corps = lignes.length ? `\n${lignes.join(',\n')}\n` : '';
  return new TextEncoder().encode(`${tete.slice(0, -1)},"elements":[${corps}]}\n`);
}

// ── Le Y.Doc ────────────────────────────────────────────────────────────────

export const elementsDe = (doc: Y.Doc) => doc.getMap<Element>('elements');
const metaDe = (doc: Y.Doc) => doc.getMap<number>('meta');

/** Le tableau tel que le document le porte — validé comme s'il venait d'un fichier. */
export function depuisDoc(doc: Y.Doc): Tableau {
  const meta = metaDe(doc);
  const largeur = meta.get('largeur') ?? LARGEUR;
  const hauteur = meta.get('hauteur') ?? HAUTEUR;
  const elements: Element[] = [];
  elementsDe(doc).forEach((v) => {
    // Une update vient d'un pair qu'on ne contrôle pas : on revalide.
    const e = lireElement(v, largeur, hauteur);
    if (e) elements.push(e);
  });
  return { largeur, hauteur, elements: ordonner(elements) };
}

/** Le `z` d'un élément neuf : au-dessus de tout ce qu'on voit. */
export function zSuivant(doc: Y.Doc): number {
  let max = -1;
  elementsDe(doc).forEach((e) => {
    if (typeof e?.z === 'number' && e.z > max) max = e.z;
  });
  return Math.floor(max) + 1;
}

export function nouvelId(): string {
  const o = crypto.getRandomValues(new Uint8Array(8));
  return 'x-' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function poser(doc: Y.Doc, e: Element, origine: unknown): void {
  doc.transact(() => elementsDe(doc).set(e.id, propre(e)), origine);
}

export function retirer(doc: Y.Doc, id: string, origine: unknown): void {
  doc.transact(() => elementsDe(doc).delete(id), origine);
}

/** Déplace un élément (trait ou texte) de (dx, dy), borné à la surface. */
export function deplace(e: Element, dx: number, dy: number, l = LARGEUR, h = HAUTEUR): Element {
  if (e.type === 'texte') return { ...e, x: borner(arrondi(e.x + dx), 0, l), y: borner(arrondi(e.y + dy), 0, h) };
  const points = e.points.map((v, i) => borner(arrondi(v + (i % 2 === 0 ? dx : dy)), 0, i % 2 === 0 ? l : h));
  return { ...e, points };
}
