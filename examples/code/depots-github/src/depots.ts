/**
 * depots — le FORMAT `.github` : une liste de dépôts suivis, et pour chacun le
 * dernier RELEVÉ (étoiles, tickets ouverts, dernière version). Pur.
 *
 * ```json
 * { "format": "filarr-depots", "version": 1,
 *   "depots": [{ "nom": "yjs/yjs", "releve": { "etoiles": 18500, "issues": 120,
 *                "version": "v13.6.20", "publiee": "2024-10-01T…Z", "le": "2026-10-23T…Z" } }] }
 * ```
 *
 * Pourquoi garder le relevé dans le fichier : c'est ce qui permet de dire
 * « nouvelle version depuis la dernière fois », et d'afficher quelque chose
 * hors ligne. Un relevé ne s'écrit que sur un geste (« Actualiser ») — jamais à
 * l'ouverture, jamais en lecture seule.
 */

export const FORMAT = 'filarr-depots';
export const VERSION = 1;
export const DEPOTS_MAX = 100;

/** `propriétaire/dépôt`, tel que GitHub les accepte. */
const NOM_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export interface Releve {
  etoiles: number;
  issues: number;
  /** `null` : aucune version publiée. */
  version: string | null;
  publiee: string | null;
  /** L'instant du relevé. */
  le: string;
}

export interface Depot {
  nom: string;
  releve: Releve | null;
}

export type Lecture = { ok: true; depots: Depot[]; repare: boolean } | { ok: false; raison: 'json' | 'format' | { version: number } };

/** Normalise « https://github.com/yjs/yjs.git », « yjs/yjs », « @yjs/yjs »… en `yjs/yjs` ; `null` sinon. */
export function nomDepot(saisie: string): string | null {
  let s = saisie.trim();
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/^@/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const parties = s.split('/');
  if (parties.length !== 2 || parties.some((p) => p === '.' || p === '..')) return null;
  return NOM_RE.test(s) ? s : null;
}

const entier = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const instant = (v: unknown) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

export function lireReleve(v: unknown): Releve | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const etoiles = entier(r.etoiles);
  const issues = entier(r.issues);
  const le = instant(r.le);
  if (etoiles === null || issues === null || le === null) return null;
  const version = typeof r.version === 'string' ? r.version.slice(0, 100) : null;
  return { etoiles, issues, version, publiee: instant(r.publiee), le };
}

export function lireDepots(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, depots: [], repare: false };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    return { ok: false, raison: 'json' };
  }
  if (typeof brut !== 'object' || brut === null || (brut as { format?: unknown }).format !== FORMAT) return { ok: false, raison: 'format' };
  const b = brut as { version?: unknown; depots?: unknown };
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.depots)) return { ok: false, raison: 'format' };
  let repare = b.depots.length > DEPOTS_MAX;
  const vus = new Set<string>();
  const depots: Depot[] = [];
  for (const d of b.depots.slice(0, DEPOTS_MAX)) {
    const r = (d ?? {}) as Record<string, unknown>;
    const nom = typeof r.nom === 'string' ? nomDepot(r.nom) : null;
    if (!nom || vus.has(nom.toLowerCase())) {
      repare = true;
      continue;
    }
    vus.add(nom.toLowerCase());
    const releve = r.releve === null || r.releve === undefined ? null : lireReleve(r.releve);
    if (nom !== r.nom || (r.releve && !releve) || (releve && JSON.stringify(releve) !== JSON.stringify(r.releve))) repare = true;
    depots.push({ nom, releve });
  }
  return { ok: true, depots, repare };
}

export function ecrireDepots(depots: Depot[]): Uint8Array {
  const propre = {
    format: FORMAT,
    version: VERSION,
    depots: depots.map((d) => ({
      nom: d.nom,
      releve: d.releve
        ? { etoiles: d.releve.etoiles, issues: d.releve.issues, version: d.releve.version, publiee: d.releve.publiee, le: d.releve.le }
        : null,
    })),
  };
  return new TextEncoder().encode(JSON.stringify(propre, null, 2) + '\n');
}

/** Une version publiée depuis le relevé précédent ? (Pas de précédent : non.) */
export function nouvelleVersion(avant: Releve | null, apres: Releve): boolean {
  return !!avant && apres.version !== null && apres.version !== avant.version;
}
