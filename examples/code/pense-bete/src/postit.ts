/**
 * postit — le FORMAT `.postit` et ses opérations. Pur : ni DOM, ni hôte.
 *
 * ```json
 * { "format": "filarr-postit", "version": 1,
 *   "notes": [{ "id": "n-4f2a9c", "x": 40, "y": 32, "couleur": "jaune", "texte": "…" }] }
 * ```
 *
 * Le fichier ne contient QUE le contenu : position, couleur, texte. Ce qui est
 * affaire d'affichage (le zoom, les notes repliées) n'y entre pas — c'est le
 * rôle du stockage de l'extension (`preferences.ts`) : deux personnes qui
 * partagent un tableau ne se replient pas les notes l'une de l'autre.
 *
 * L'écriture est CANONIQUE (ordre des clés fixe, indentation de deux espaces,
 * saut de ligne final) : un fichier écrit par cette extension se relit et se
 * réécrit à l'octet près. Un fichier d'une version future est REFUSÉ avec un
 * message lisible, jamais réécrit dans l'ancien format.
 */

export const FORMAT = 'filarr-postit';
export const VERSION = 1;

export const COULEURS = ['jaune', 'rose', 'bleu', 'vert', 'orange', 'violet'] as const;
export type Couleur = (typeof COULEURS)[number];

/** La surface du tableau : au-delà, une note serait perdue hors de vue. */
export const LARGEUR_MAX = 4000;
export const HAUTEUR_MAX = 4000;
export const LARGEUR_NOTE = 200;
export const HAUTEUR_NOTE = 150;
export const TEXTE_MAX = 10_000;
export const NOTES_MAX = 500;

export interface Note {
  id: string;
  x: number;
  y: number;
  couleur: Couleur;
  texte: string;
}

export interface Tableau {
  notes: Note[];
}

export type Echec = { ok: false; raison: 'json' | 'format' | { version: number } };
export type Lecture = { ok: true; tableau: Tableau; repare: boolean } | Echec;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function tableauVide(): Tableau {
  return { notes: [] };
}

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Une note lue d'un fichier qui peut venir de n'importe qui : chaque champ est borné. */
function lireNote(brut: unknown, vus: Set<string>): { note: Note; repare: boolean } | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const n = brut as Record<string, unknown>;
  let repare = false;
  let id = typeof n.id === 'string' && ID_RE.test(n.id) && !vus.has(n.id) ? n.id : null;
  if (id === null) {
    id = nouvelId(vus);
    repare = true;
  }
  vus.add(id);
  const num = (v: unknown, max: number) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const b = borner(v, 0, max);
      if (b !== v) repare = true;
      return b;
    }
    repare = true;
    return 0;
  };
  const x = num(n.x, LARGEUR_MAX - LARGEUR_NOTE);
  const y = num(n.y, HAUTEUR_MAX - HAUTEUR_NOTE);
  let couleur: Couleur = 'jaune';
  if (typeof n.couleur === 'string' && (COULEURS as readonly string[]).includes(n.couleur)) couleur = n.couleur as Couleur;
  else repare = true;
  let texte = typeof n.texte === 'string' ? n.texte : '';
  if (typeof n.texte !== 'string') repare = true;
  if (texte.length > TEXTE_MAX) {
    texte = texte.slice(0, TEXTE_MAX);
    repare = true;
  }
  return { note: { id, x, y, couleur, texte }, repare };
}

export function lirePenseBete(octets: Uint8Array): Lecture {
  // 0 octet : le menu « Nouveau document » vient de créer le fichier.
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
  const b = brut as { version?: unknown; notes?: unknown };
  if (b.version !== VERSION) return { ok: false, raison: { version: typeof b.version === 'number' ? b.version : NaN } };
  if (!Array.isArray(b.notes)) return { ok: false, raison: 'format' };
  const vus = new Set<string>();
  const notes: Note[] = [];
  let repare = b.notes.length > NOTES_MAX;
  for (const n of b.notes.slice(0, NOTES_MAX)) {
    const lu = lireNote(n, vus);
    if (!lu) {
      repare = true;
      continue;
    }
    if (lu.repare) repare = true;
    notes.push(lu.note);
  }
  return { ok: true, tableau: { notes }, repare };
}

export function ecrirePenseBete(t: Tableau): Uint8Array {
  const propre = {
    format: FORMAT,
    version: VERSION,
    notes: t.notes.map((n) => ({ id: n.id, x: n.x, y: n.y, couleur: n.couleur, texte: n.texte })),
  };
  return new TextEncoder().encode(JSON.stringify(propre, null, 2) + '\n');
}

/** Un identifiant aléatoire : il ne dit rien du contenu (les préférences s'y accrochent). */
export function nouvelId(pris: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const o = crypto.getRandomValues(new Uint8Array(6));
    const id = 'n-' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
    if (!pris.has(id)) return id;
  }
}

// ── Les opérations : chacune rend un NOUVEAU tableau (l'ancien reste intact) ──

export function ajouterNote(t: Tableau, x: number, y: number, couleur: Couleur, id = nouvelId(new Set(t.notes.map((n) => n.id)))): Tableau {
  if (t.notes.length >= NOTES_MAX) return t;
  const note: Note = {
    id,
    x: borner(x, 0, LARGEUR_MAX - LARGEUR_NOTE),
    y: borner(y, 0, HAUTEUR_MAX - HAUTEUR_NOTE),
    couleur,
    texte: '',
  };
  return { notes: [...t.notes, note] };
}

function remplacer(t: Tableau, id: string, f: (n: Note) => Note): Tableau {
  return { notes: t.notes.map((n) => (n.id === id ? f(n) : n)) };
}

export function deplacerNote(t: Tableau, id: string, x: number, y: number): Tableau {
  return remplacer(t, id, (n) => ({
    ...n,
    x: borner(x, 0, LARGEUR_MAX - LARGEUR_NOTE),
    y: borner(y, 0, HAUTEUR_MAX - HAUTEUR_NOTE),
  }));
}

export function ecrireNote(t: Tableau, id: string, texte: string): Tableau {
  return remplacer(t, id, (n) => ({ ...n, texte: texte.slice(0, TEXTE_MAX) }));
}

export function couleurSuivante(c: Couleur): Couleur {
  return COULEURS[(COULEURS.indexOf(c) + 1) % COULEURS.length];
}

export function recolorerNote(t: Tableau, id: string, couleur: Couleur): Tableau {
  return remplacer(t, id, (n) => ({ ...n, couleur }));
}

export function supprimerNote(t: Tableau, id: string): Tableau {
  return { notes: t.notes.filter((n) => n.id !== id) };
}

/** Passe une note au premier plan (dernière dans l'ordre = dessinée au-dessus). */
export function premierPlan(t: Tableau, id: string): Tableau {
  const n = t.notes.find((x) => x.id === id);
  if (!n || t.notes[t.notes.length - 1] === n) return t;
  return { notes: [...t.notes.filter((x) => x.id !== id), n] };
}

/** Une place libre pour une note neuve : en cascade, à partir du coin. */
export function placeLibre(t: Tableau): { x: number; y: number } {
  const pris = new Set(t.notes.map((n) => `${n.x},${n.y}`));
  for (let i = 0; i < 200; i++) {
    const x = 24 + (i % 10) * 28 + Math.floor(i / 10) * 220;
    const y = 24 + (i % 10) * 28;
    if (!pris.has(`${x},${y}`)) return { x, y };
  }
  return { x: 24, y: 24 };
}
