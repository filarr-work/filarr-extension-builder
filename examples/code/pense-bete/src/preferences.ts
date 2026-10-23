/**
 * preferences — ce que la capacité `storage` garde : l'AFFICHAGE, jamais le
 * contenu. Pur : la lecture et l'écriture des octets, et les transitions.
 *
 * ```json
 * { "v": 1, "zoom": 1, "repliees": ["n-4f2a9c", "n-0b11d7"] }
 * ```
 *
 * Pourquoi le stockage, et pas le fichier : le zoom et les notes repliées sont
 * à vous, sur cet appareil. Mis dans le fichier, ils seraient imposés à tous
 * ceux qui partagent le tableau — et chaque repli coûterait une version.
 *
 * Pourquoi ce n'est PAS une fuite de contenu : on ne range que des
 * identifiants de notes, tirés au hasard (`nouvelId`), et un niveau de zoom.
 * Le stockage est chiffré par l'hôte, local à l'appareil, effacé à la
 * désinstallation — mais il n'a de toute façon rien à protéger ici.
 */

export const CLE_PREFERENCES = 'affichage';
export const NIVEAUX_ZOOM = [0.5, 0.75, 1, 1.25, 1.5] as const;
/** On oublie les plus anciennes : des notes supprimées depuis longtemps n'ont plus à peser. */
export const REPLIEES_MAX = 500;

export interface Preferences {
  zoom: number;
  repliees: string[];
}

export function preferencesParDefaut(): Preferences {
  return { zoom: 1, repliees: [] };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Lit des octets du stockage — absents, abîmés ou d'une autre version : les défauts. */
export function lirePreferences(octets: Uint8Array | null): Preferences {
  if (!octets || octets.byteLength === 0) return preferencesParDefaut();
  try {
    const b = JSON.parse(new TextDecoder().decode(octets)) as { v?: unknown; zoom?: unknown; repliees?: unknown };
    if (b.v !== 1) return preferencesParDefaut();
    const zoom = (NIVEAUX_ZOOM as readonly number[]).includes(b.zoom as number) ? (b.zoom as number) : 1;
    const repliees = Array.isArray(b.repliees)
      ? b.repliees.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(-REPLIEES_MAX)
      : [];
    return { zoom, repliees };
  } catch {
    return preferencesParDefaut();
  }
}

export function ecrirePreferences(p: Preferences): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, zoom: p.zoom, repliees: p.repliees }));
}

export function estRepliee(p: Preferences, id: string): boolean {
  return p.repliees.includes(id);
}

export function basculerRepli(p: Preferences, id: string): Preferences {
  if (estRepliee(p, id)) return { ...p, repliees: p.repliees.filter((x) => x !== id) };
  return { ...p, repliees: [...p.repliees, id].slice(-REPLIEES_MAX) };
}

/** Un cran de zoom vers le haut (+1) ou le bas (-1), borné aux niveaux permis. */
export function zoomer(p: Preferences, sens: 1 | -1): Preferences {
  const i = NIVEAUX_ZOOM.indexOf(p.zoom as (typeof NIVEAUX_ZOOM)[number]);
  const j = Math.min(NIVEAUX_ZOOM.length - 1, Math.max(0, (i < 0 ? 2 : i) + sens));
  return { ...p, zoom: NIVEAUX_ZOOM[j] };
}
