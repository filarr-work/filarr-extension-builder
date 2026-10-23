/**
 * planche — le FORMAT `.planche` : un titre, une mise en page, et des photos
 * RÉDUITES, embarquées en data URL. Pur.
 *
 * ```json
 * { "format": "filarr-planche", "version": 1, "titre": "…", "colonnes": 3,
 *   "photos": [{ "id": "p-…", "nom": "phare.jpg", "legende": "…", "largeur": 480, "hauteur": 320,
 *                "image": "data:image/jpeg;base64,…" }] }
 * ```
 *
 * Pourquoi embarquer une copie : l'extension ne garde AUCUN lien vers les
 * originaux. Le sélecteur de Filarr ne lui donne que des poignées valables
 * pour la session ; une fois le document fermé, elles ne valent plus rien. La
 * planche se suffit donc à elle-même : elle se rouvre, se partage, se lit
 * ailleurs, sans jamais dire où étaient les originaux.
 */

import { lireDataUrl } from './images';

export const FORMAT = 'filarr-planche';
export const VERSION = 1;
export const PHOTOS_MAX = 60;
/** Une vignette embarquée : 600 Kio de data URL au plus. */
export const IMAGE_MAX_CARACTERES = 600 * 1024;
export const TITRE_MAX = 120;
export const LEGENDE_MAX = 300;
export const COLONNES = [2, 3, 4, 5] as const;

export interface Photo {
  id: string;
  nom: string;
  legende: string;
  largeur: number;
  hauteur: number;
  image: string;
}

export interface Planche {
  titre: string;
  colonnes: number;
  photos: Photo[];
}

export type Lecture = { ok: true; planche: Planche; repare: boolean } | { ok: false; raison: 'json' | 'format' | { version: number } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function plancheVide(): Planche {
  return { titre: '', colonnes: 3, photos: [] };
}

export function nouvelId(pris: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const o = crypto.getRandomValues(new Uint8Array(6));
    const id = 'p-' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!pris.has(id)) return id;
  }
}

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const dim = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 20_000 ? v : null);

export function lirePlanche(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, planche: plancheVide(), repare: false };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    return { ok: false, raison: 'json' };
  }
  if (typeof brut !== 'object' || brut === null || (brut as { format?: unknown }).format !== FORMAT) return { ok: false, raison: 'format' };
  const b = brut as Record<string, unknown>;
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.photos)) return { ok: false, raison: 'format' };
  const colonnes = (COLONNES as readonly number[]).includes(b.colonnes as number) ? (b.colonnes as number) : 3;
  let repare = colonnes !== b.colonnes || b.photos.length > PHOTOS_MAX || texte(b.titre, TITRE_MAX) !== b.titre;
  const vus = new Set<string>();
  const photos: Photo[] = [];
  for (const p of b.photos.slice(0, PHOTOS_MAX)) {
    const r = (p ?? {}) as Record<string, unknown>;
    // Une image qui ne prouve pas ce qu'elle annonce ne va jamais dans un `src`.
    const image = lireDataUrl(r.image, IMAGE_MAX_CARACTERES);
    const largeur = dim(r.largeur);
    const hauteur = dim(r.hauteur);
    if (!image || largeur === null || hauteur === null) {
      repare = true;
      continue;
    }
    let id = typeof r.id === 'string' && ID_RE.test(r.id) && !vus.has(r.id) ? r.id : null;
    if (!id) {
      id = nouvelId(vus);
      repare = true;
    }
    vus.add(id);
    const photo: Photo = { id, nom: texte(r.nom, 200), legende: texte(r.legende, LEGENDE_MAX), largeur, hauteur, image: r.image as string };
    if (photo.nom !== r.nom || photo.legende !== r.legende) repare = true;
    photos.push(photo);
  }
  return { ok: true, planche: { titre: texte(b.titre, TITRE_MAX), colonnes, photos }, repare };
}

export function ecrirePlanche(p: Planche): Uint8Array {
  const propre = {
    format: FORMAT,
    version: VERSION,
    titre: p.titre,
    colonnes: p.colonnes,
    photos: p.photos.map((x) => ({ id: x.id, nom: x.nom, legende: x.legende, largeur: x.largeur, hauteur: x.hauteur, image: x.image })),
  };
  return new TextEncoder().encode(JSON.stringify(propre, null, 2) + '\n');
}

/** Déplace la photo `i` d'un cran (`-1` : vers le début), sans sortir de la liste. */
export function deplacer(photos: Photo[], i: number, sens: -1 | 1): Photo[] {
  const j = i + sens;
  if (i < 0 || i >= photos.length || j < 0 || j >= photos.length) return photos;
  const copie = [...photos];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}
