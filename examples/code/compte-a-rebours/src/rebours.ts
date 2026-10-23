/**
 * rebours — le FORMAT `.rebours`, les DONNÉES d'un bloc de note, et le calcul
 * d'un compte à rebours. Pur : ni DOM, ni hôte.
 *
 * Deux contenants, deux formes :
 *
 *  - le fichier `.rebours` : une liste d'évènements datés
 *    `{ "format": "filarr-rebours", "version": 1, "evenements": [{ id, titre, date, note }] }` ;
 *  - un bloc de note : UN évènement, `{ "v": 1, "titre": "…", "date": "…" }`.
 *    Ces octets sont ce que le bloc rend par `saveBytes` ; c'est la NOTE qui
 *    les range (en base64 dans son HTML), les chiffre et les synchronise.
 *    Ils doivent rester petits : 256 Kio au plus une fois décodés.
 *
 * Les dates sont des INSTANTS (ISO 8601 en UTC, `…Z`) : deux personnes qui
 * partagent le compte à rebours dans deux fuseaux attendent le même moment.
 * L'interface les montre et les saisit en heure locale.
 */

export const FORMAT = 'filarr-rebours';
export const VERSION = 1;
export const EVENEMENTS_MAX = 500;
export const TITRE_MAX = 120;
export const NOTE_MAX = 2000;
/** Le plafond des données d'un bloc (`EXTENSION_BLOCK_MAX_BYTES` de Filarr). */
export const BLOC_MAX_OCTETS = 256 * 1024;

export interface Evenement {
  id: string;
  titre: string;
  /** Instant ISO 8601, UTC. */
  date: string;
  note: string;
}

export type Lecture =
  | { ok: true; evenements: Evenement[]; repare: boolean }
  | { ok: false; raison: 'json' | 'format' | { version: number } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Une date lue d'un fichier : un instant valide, réécrit sous sa forme canonique. */
export function dateCanonique(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function nouvelId(pris: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const o = crypto.getRandomValues(new Uint8Array(6));
    const id = 'e-' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!pris.has(id)) return id;
  }
}

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function lireRebours(octets: Uint8Array): Lecture {
  if (octets.byteLength === 0) return { ok: true, evenements: [], repare: false };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    return { ok: false, raison: 'json' };
  }
  if (typeof brut !== 'object' || brut === null || (brut as { format?: unknown }).format !== FORMAT) {
    return { ok: false, raison: 'format' };
  }
  const b = brut as { version?: unknown; evenements?: unknown };
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.evenements)) return { ok: false, raison: 'format' };
  let repare = b.evenements.length > EVENEMENTS_MAX;
  const vus = new Set<string>();
  const evenements: Evenement[] = [];
  for (const e of b.evenements.slice(0, EVENEMENTS_MAX)) {
    if (typeof e !== 'object' || e === null) {
      repare = true;
      continue;
    }
    const r = e as Record<string, unknown>;
    const date = dateCanonique(r.date);
    if (date === null) {
      repare = true;
      continue;
    }
    let id = typeof r.id === 'string' && ID_RE.test(r.id) && !vus.has(r.id) ? r.id : null;
    if (id === null) {
      id = nouvelId(vus);
      repare = true;
    }
    vus.add(id);
    const ev: Evenement = { id, titre: texte(r.titre, TITRE_MAX), date, note: texte(r.note, NOTE_MAX) };
    if (date !== r.date || ev.titre !== r.titre || ev.note !== r.note) repare = true;
    evenements.push(ev);
  }
  return { ok: true, evenements, repare };
}

export function ecrireRebours(evenements: Evenement[]): Uint8Array {
  const propre = {
    format: FORMAT,
    version: VERSION,
    evenements: evenements.map((e) => ({ id: e.id, titre: e.titre, date: e.date, note: e.note })),
  };
  return new TextEncoder().encode(JSON.stringify(propre, null, 2) + '\n');
}

/** Les évènements dans l'ordre du temps (les égalités gardent leur ordre). */
export function chronologique(evenements: Evenement[]): Evenement[] {
  return evenements
    .map((e, i) => [e, i] as const)
    .sort((a, b) => Date.parse(a[0].date) - Date.parse(b[0].date) || a[1] - b[1])
    .map(([e]) => e);
}

/** Le premier évènement à venir, ou `null`. */
export function prochain(evenements: Evenement[], maintenant: number): Evenement | null {
  return chronologique(evenements).find((e) => Date.parse(e.date) > maintenant) ?? null;
}

// ── Les données d'un bloc de note ───────────────────────────────────────────

export interface DonneesBloc {
  titre: string;
  date: string | null;
}

/** 0 octet = bloc neuf ; illisible = bloc neuf aussi (le bloc ne doit pas casser la note). */
export function lireBloc(octets: Uint8Array): { donnees: DonneesBloc; lisible: boolean } {
  if (octets.byteLength === 0) return { donnees: { titre: '', date: null }, lisible: true };
  try {
    const b = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets)) as Record<string, unknown>;
    if (b.v !== 1) throw new Error('version');
    return { donnees: { titre: texte(b.titre, TITRE_MAX), date: dateCanonique(b.date) }, lisible: true };
  } catch {
    return { donnees: { titre: '', date: null }, lisible: false };
  }
}

export function ecrireBloc(d: DonneesBloc): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, titre: d.titre.slice(0, TITRE_MAX), date: d.date }));
}

// ── Le compte à rebours ─────────────────────────────────────────────────────

export interface Ecart {
  passe: boolean;
  jours: number;
  heures: number;
  minutes: number;
  secondes: number;
  /** En millisecondes, toujours positif. */
  total: number;
}

export function ecart(maintenant: number, cible: number): Ecart {
  const brut = cible - maintenant;
  const total = Math.abs(brut);
  const s = Math.floor(total / 1000);
  return {
    passe: brut < 0,
    jours: Math.floor(s / 86_400),
    heures: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    secondes: s % 60,
    total,
  };
}

const d2 = (n: number) => String(n).padStart(2, '0');

/** « 12 j 04 h 32 min 10 s » ; l'unité des jours suit la langue. */
export function formatCompte(e: Ecart, langue: 'fr' | 'en'): string {
  const j = langue === 'fr' ? 'j' : 'd';
  const parts = e.jours > 0 ? [`${e.jours} ${j}`] : [];
  parts.push(`${d2(e.heures)} h`, `${d2(e.minutes)} min`, `${d2(e.secondes)} s`);
  return parts.join(' ');
}

/** Pour `<input type="datetime-local">` : l'instant en heure LOCALE, à la minute. */
export function versChampLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}T${d2(d.getHours())}:${d2(d.getMinutes())}`;
}

/** Depuis `<input type="datetime-local">` (heure locale) vers un instant UTC. */
export function depuisChampLocal(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Demain à 9 h, heure locale : la date proposée pour un évènement neuf. */
export function demainNeufHeures(maintenant: number): string {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0, 0).toISOString();
}
