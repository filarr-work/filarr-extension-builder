/**
 * croquis — le FORMAT `.croquis` : des traits à main levée, en JSON. Pur.
 *
 * ```
 * {"format":"filarr-croquis","version":1,"largeur":1200,"hauteur":800,"fond":"#ffffff","traits":[
 * {"couleur":"#1f2937","epaisseur":4,"points":[120.5,80,131,92.5]}
 * ]}
 * ```
 *
 * Un trait par ligne : un dessin se compare ainsi trait par trait dans un
 * outil de différences, et l'écriture reste canonique (un fichier écrit par
 * l'extension se relit et se réécrit à l'octet près). Les points sont à plat
 * (`x, y, x, y…`), arrondis au dixième d'unité : la précision du geste, sans
 * les quinze décimales d'un `clientX` divisé par une échelle.
 *
 * Tout ce qui est lu est BORNÉ : un fichier vient peut-être de quelqu'un
 * d'autre, et un trait d'un milliard de points ne doit pas figer la page.
 */

export const FORMAT = 'filarr-croquis';
export const VERSION = 1;
export const LARGEUR_DEFAUT = 1200;
export const HAUTEUR_DEFAUT = 800;
export const FOND_DEFAUT = '#ffffff';
export const TRAITS_MAX = 20_000;
export const POINTS_MAX = 20_000;
export const EPAISSEUR_MIN = 1;
export const EPAISSEUR_MAX = 64;

export interface Trait {
  couleur: string;
  epaisseur: number;
  /** À plat : x0, y0, x1, y1… — toujours un nombre pair de valeurs. */
  points: number[];
}

export interface Croquis {
  largeur: number;
  hauteur: number;
  fond: string;
  traits: Trait[];
}

export type Lecture = { ok: true; croquis: Croquis; repare: boolean } | { ok: false; raison: 'json' | 'format' | { version: number } };

const COULEUR_RE = /^#[0-9a-f]{6}$/;

export function croquisVide(): Croquis {
  return { largeur: LARGEUR_DEFAUT, hauteur: HAUTEUR_DEFAUT, fond: FOND_DEFAUT, traits: [] };
}

export const arrondi = (v: number) => Math.round(v * 10) / 10;
const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function lireTrait(brut: unknown, l: number, h: number): { trait: Trait; repare: boolean } | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const t = brut as Record<string, unknown>;
  let repare = false;
  const couleur = typeof t.couleur === 'string' && COULEUR_RE.test(t.couleur) ? t.couleur : '#000000';
  if (couleur !== t.couleur) repare = true;
  let epaisseur = typeof t.epaisseur === 'number' && Number.isFinite(t.epaisseur) ? t.epaisseur : 4;
  const e = borner(arrondi(epaisseur), EPAISSEUR_MIN, EPAISSEUR_MAX);
  if (e !== t.epaisseur) repare = true;
  epaisseur = e;
  if (!Array.isArray(t.points)) return null;
  const n = Math.min(t.points.length - (t.points.length % 2), POINTS_MAX * 2);
  if (n !== t.points.length) repare = true;
  const points: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const x = t.points[i];
    const y = t.points[i + 1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      repare = true;
      continue;
    }
    const px = borner(arrondi(x), 0, l);
    const py = borner(arrondi(y), 0, h);
    if (px !== x || py !== y) repare = true;
    points.push(px, py);
  }
  if (points.length === 0) return null;
  return { trait: { couleur, epaisseur, points }, repare };
}

export function lireCroquis(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, croquis: croquisVide(), repare: false };
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
  if (!Array.isArray(b.traits)) return { ok: false, raison: 'format' };
  let repare = false;
  const dim = (v: unknown, d: number) => {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 16 && v <= 10_000) return v;
    repare = true;
    return d;
  };
  const largeur = dim(b.largeur, LARGEUR_DEFAUT);
  const hauteur = dim(b.hauteur, HAUTEUR_DEFAUT);
  let fond = FOND_DEFAUT;
  if (typeof b.fond === 'string' && COULEUR_RE.test(b.fond)) fond = b.fond;
  else repare = true;
  const traits: Trait[] = [];
  if (b.traits.length > TRAITS_MAX) repare = true;
  for (const t of b.traits.slice(0, TRAITS_MAX)) {
    const lu = lireTrait(t, largeur, hauteur);
    if (!lu) {
      repare = true;
      continue;
    }
    if (lu.repare) repare = true;
    traits.push(lu.trait);
  }
  return { ok: true, croquis: { largeur, hauteur, fond, traits }, repare };
}

export function ecrireCroquis(c: Croquis): Uint8Array {
  const entete = JSON.stringify({ format: FORMAT, version: VERSION, largeur: c.largeur, hauteur: c.hauteur, fond: c.fond });
  const lignes = c.traits.map((t) => JSON.stringify({ couleur: t.couleur, epaisseur: t.epaisseur, points: t.points }));
  const corps = lignes.length ? `\n${lignes.join(',\n')}\n` : '';
  return new TextEncoder().encode(`${entete.slice(0, -1)},"traits":[${corps}]}\n`);
}

/** Le chemin SVG d'un trait. Un point seul devient un point visible (bout rond). */
export function cheminSvg(t: Trait): string {
  const p = t.points;
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.01 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}

/** Ajoute un point au trait en cours, s'il s'est assez éloigné du précédent. */
export function prolonger(points: number[], x: number, y: number, ecartMin = 1.5): number[] {
  const n = points.length;
  const px = arrondi(x);
  const py = arrondi(y);
  if (n >= 2 && Math.hypot(px - points[n - 2], py - points[n - 1]) < ecartMin) return points;
  return [...points, px, py];
}
