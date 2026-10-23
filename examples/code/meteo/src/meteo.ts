/**
 * meteo — le FORMAT `.meteo` (la liste des villes suivies) et le RÉGLAGE du
 * widget d'accueil. Pur.
 *
 * Le fichier ne garde que des villes : nom et coordonnées. Aucune mesure n'y
 * est écrite — la météo d'hier n'a rien à faire dans un document chiffré et
 * versionné, et l'écrire coûterait une version à chaque consultation.
 *
 * LE RÉGLAGE DU WIDGET. Un widget d'accueil ne lit pas ce fichier : il ne
 * reçoit que le texte que l'utilisateur a saisi dans ses options (240
 * caractères au plus), en UTF-8, comme `host.initialBytes`. On y accepte :
 *
 *   `Lyon`                    une ville du répertoire embarqué ;
 *   `45.764, 4.8357`          des coordonnées ;
 *   `Chez moi | 45.76 | 4.83` un nom et des coordonnées.
 *
 * L'éditeur affiche, pour chaque ville, le réglage à recopier.
 */

import { villeExacte } from './villes';

export const FORMAT = 'filarr-meteo';
export const VERSION = 1;
export const VILLES_MAX = 50;
export const NOM_MAX = 80;
export const REGLAGE_MAX = 240;

export interface Lieu {
  id: string;
  nom: string;
  lat: number;
  lon: number;
}

export type Lecture = { ok: true; lieux: Lieu[]; repare: boolean } | { ok: false; raison: 'json' | 'format' | { version: number } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function coordonneesValides(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function nouvelId(pris: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const o = crypto.getRandomValues(new Uint8Array(6));
    const id = 'v-' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!pris.has(id)) return id;
  }
}

export function lireMeteo(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, lieux: [], repare: false };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    return { ok: false, raison: 'json' };
  }
  if (typeof brut !== 'object' || brut === null || (brut as { format?: unknown }).format !== FORMAT) return { ok: false, raison: 'format' };
  const b = brut as { version?: unknown; villes?: unknown };
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.villes)) return { ok: false, raison: 'format' };
  let repare = b.villes.length > VILLES_MAX;
  const vus = new Set<string>();
  const lieux: Lieu[] = [];
  for (const v of b.villes.slice(0, VILLES_MAX)) {
    const r = (v ?? {}) as Record<string, unknown>;
    const lat = typeof r.lat === 'number' ? r.lat : NaN;
    const lon = typeof r.lon === 'number' ? r.lon : NaN;
    if (!coordonneesValides(lat, lon) || typeof r.nom !== 'string') {
      repare = true;
      continue;
    }
    let id = typeof r.id === 'string' && ID_RE.test(r.id) && !vus.has(r.id) ? r.id : null;
    if (!id) {
      id = nouvelId(vus);
      repare = true;
    }
    vus.add(id);
    const nom = r.nom.slice(0, NOM_MAX);
    if (nom !== r.nom) repare = true;
    lieux.push({ id, nom, lat, lon });
  }
  return { ok: true, lieux, repare };
}

export function ecrireMeteo(lieux: Lieu[]): Uint8Array {
  const propre = { format: FORMAT, version: VERSION, villes: lieux.map((l) => ({ id: l.id, nom: l.nom, lat: l.lat, lon: l.lon })) };
  return new TextEncoder().encode(JSON.stringify(propre, null, 2) + '\n');
}

export type Reglage = { ok: true; nom: string; lat: number; lon: number } | { ok: false; raison: 'vide' | 'inconnu' };

const nombre = (s: string) => Number(s.trim().replace(',', '.'));

export function lireReglage(octets: Uint8Array): Reglage {
  const texte = new TextDecoder().decode(octets).slice(0, REGLAGE_MAX).trim();
  if (!texte) return { ok: false, raison: 'vide' };
  const parts = texte.split('|').map((p) => p.trim());
  if (parts.length === 3) {
    const [nom, lat, lon] = [parts[0], nombre(parts[1]), nombre(parts[2])];
    if (coordonneesValides(lat, lon)) return { ok: true, nom: nom.slice(0, NOM_MAX) || `${lat}, ${lon}`, lat, lon };
  }
  const m = /^(-?\d{1,2}(?:[.,]\d+)?)\s*[;, ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(texte);
  if (m) {
    const lat = nombre(m[1]);
    const lon = nombre(m[2]);
    if (coordonneesValides(lat, lon)) return { ok: true, nom: `${lat}, ${lon}`, lat, lon };
  }
  const v = villeExacte(texte);
  return v ? { ok: true, nom: v.nom, lat: v.lat, lon: v.lon } : { ok: false, raison: 'inconnu' };
}

/** Le réglage à recopier dans les options du widget, pour ce lieu. */
export function reglagePour(l: Lieu): string {
  const v = villeExacte(l.nom);
  if (v && Math.abs(v.lat - l.lat) < 1e-3 && Math.abs(v.lon - l.lon) < 1e-3) return v.nom;
  return `${l.nom.replace(/\|/g, ' ')} | ${l.lat} | ${l.lon}`.slice(0, REGLAGE_MAX);
}
