/**
 * srt — les sous-titres SubRip (`.srt`) en lecture et en écriture, et
 * l'IMPORT des WebVTT (`.vtt`). Pur : ni DOM, ni hôte.
 *
 * L'IMPORT. La capacité `imports: ["vtt"]` fait ouvrir les `.vtt` par cet
 * éditeur ; Filarr crée le fichier `.srt` à la première sauvegarde, à côté de
 * l'original, qui n'est jamais touché. On lit donc les deux formats, et on
 * n'écrit que le nôtre. Ce que SRT ne sait pas dire (positions, styles,
 * régions, voix) est compté et annoncé, jamais passé sous silence.
 *
 * L'ÉCRITURE est canonique : blocs numérotés à partir de 1, séparés par une
 * ligne vide, temps en `HH:MM:SS,mmm`. La marque d'ordre des octets et la
 * convention de fin de ligne (`\r\n`, très courante en SRT) sont gardées.
 */

export interface SousTitre {
  /** En millisecondes. */
  debut: number;
  fin: number;
  /** Une ou plusieurs lignes, sans ligne vide (elle terminerait le bloc). */
  texte: string;
}

export interface Fichier {
  sousTitres: SousTitre[];
  bom: boolean;
  finDeLigne: '\n' | '\r\n';
}

export interface Import {
  depuis: 'vtt';
  /** Ce que SRT ne peut pas porter et qui a été laissé de côté. */
  reglagesIgnores: number;
  blocsIgnores: number;
}

export type Lecture =
  | { ok: true; fichier: Fichier; import: Import | null; blocsIllisibles: number }
  | { ok: false; raison: 'encodage' | 'format' };

export const SOUS_TITRES_MAX = 20_000;
export const TEXTE_MAX = 2000;

const TEMPS_RE = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;
const LIGNE_TEMPS_RE = /^\s*(\S+)\s+-->\s+(\S+)(.*)$/;
const BOM = [0xef, 0xbb, 0xbf];

/** `00:01:02,500` ou `01:02.5` → millisecondes ; `null` si ce n'est pas un temps. */
export function lireTemps(s: string): number | null {
  const m = TEMPS_RE.exec(s.trim());
  if (!m) return null;
  const [h, mn, sec] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (mn > 59 || sec > 59) return null;
  const ms = Number(m[4].padEnd(3, '0'));
  return ((h * 60 + mn) * 60 + sec) * 1000 + ms;
}

export function ecrireTemps(ms: number): string {
  const v = Math.max(0, Math.round(ms));
  const h = Math.floor(v / 3_600_000);
  const mn = Math.floor((v % 3_600_000) / 60_000);
  const s = Math.floor((v % 60_000) / 1000);
  const r = v % 1000;
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${d2(h)}:${d2(mn)}:${d2(s)},${String(r).padStart(3, '0')}`;
}

/** Une ligne vide terminerait le bloc : on la retire du texte, et on borne sa taille. */
export function nettoyerTexte(t: string): string {
  return t
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '')
    .join('\n')
    .slice(0, TEXTE_MAX);
}

function decoder(octets: Uint8Array): { texte: string; bom: boolean } | null {
  const bom = octets.length >= 3 && BOM.every((b, i) => octets[i] === b);
  try {
    const texte = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bom ? octets.subarray(3) : octets);
    return texte.includes('\u0000') ? null : { texte, bom };
  } catch {
    return null;
  }
}

function blocs(texte: string): string[][] {
  return texte
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((b) => b.replace(/^\n+/, '').split('\n'))
    .filter((b) => b.some((l) => l.trim() !== ''));
}

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '‎', rlm: '‏' };

/** Le texte d'une réplique WebVTT réduit à ce que SRT sait porter : `<i>`, `<b>`, `<u>`. */
export function texteDepuisVtt(t: string): string {
  return t
    .replace(/<v(?:\.[^\s>]*)?\s+([^>]+)>/g, '$1: ')
    .replace(/<\d{1,3}(?::\d{2}){1,2}\.\d{3}>/g, '')
    .replace(/<\/?(?!(?:i|b|u)>)[a-z][^>]*>/gi, '')
    .replace(/<\/(?!(?:i|b|u)>)[a-z]*>/gi, '')
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, e: string) => ENTITES[e]);
}

function lireSrt(texte: string): { sousTitres: SousTitre[]; illisibles: number } {
  const sousTitres: SousTitre[] = [];
  let illisibles = 0;
  for (const b of blocs(texte)) {
    // Le numéro est facultatif dans la nature : on le reconnaît, on ne l'exige pas.
    const i = /^\s*\d+\s*$/.test(b[0]) && b.length > 1 ? 1 : 0;
    const m = LIGNE_TEMPS_RE.exec(b[i] ?? '');
    const debut = m ? lireTemps(m[1]) : null;
    const fin = m ? lireTemps(m[2]) : null;
    if (debut === null || fin === null) {
      illisibles++;
      continue;
    }
    sousTitres.push({ debut, fin, texte: nettoyerTexte(b.slice(i + 1).join('\n')) });
  }
  return { sousTitres, illisibles };
}

function lireVtt(texte: string): { sousTitres: SousTitre[]; illisibles: number; imp: Import } {
  const imp: Import = { depuis: 'vtt', reglagesIgnores: 0, blocsIgnores: 0 };
  const sousTitres: SousTitre[] = [];
  let illisibles = 0;
  const tous = blocs(texte);
  for (const b of tous.slice(1)) {
    if (/^(NOTE|STYLE|REGION)\b/.test(b[0])) {
      imp.blocsIgnores++;
      continue;
    }
    const i = b[0].includes('-->') ? 0 : 1;
    const m = LIGNE_TEMPS_RE.exec(b[i] ?? '');
    const debut = m ? lireTemps(m[1]) : null;
    const fin = m ? lireTemps(m[2]) : null;
    if (!m || debut === null || fin === null) {
      illisibles++;
      continue;
    }
    if (m[3].trim() !== '') imp.reglagesIgnores++;
    sousTitres.push({ debut, fin, texte: nettoyerTexte(texteDepuisVtt(b.slice(i + 1).join('\n'))) });
  }
  return { sousTitres, illisibles, imp };
}

/**
 * Lit un `.srt`, ou un `.vtt` à importer (reconnu à son nom ou à sa première
 * ligne `WEBVTT`). 0 octet : un fichier neuf, sans sous-titre.
 */
export function lireSousTitres(octets: Uint8Array, nomFichier = ''): Lecture {
  const d = decoder(octets);
  if (!d) return { ok: false, raison: 'encodage' };
  const crlf = (d.texte.match(/\r\n/g) ?? []).length;
  const lf = (d.texte.match(/\n/g) ?? []).length;
  const finDeLigne = crlf > 0 && crlf * 2 >= lf ? '\r\n' : '\n';
  const estVtt = /^WEBVTT(?:[ \t]|\r?\n|$)/.test(d.texte) || /\.vtt$/i.test(nomFichier);
  if (estVtt) {
    if (!/^WEBVTT/.test(d.texte)) return { ok: false, raison: 'format' };
    const r = lireVtt(d.texte);
    return {
      ok: true,
      fichier: { sousTitres: r.sousTitres.slice(0, SOUS_TITRES_MAX), bom: d.bom, finDeLigne },
      import: r.imp,
      blocsIllisibles: r.illisibles,
    };
  }
  const r = lireSrt(d.texte);
  // Du texte, mais pas un seul bloc reconnaissable : ce n'est pas un SRT.
  if (r.sousTitres.length === 0 && r.illisibles > 0) return { ok: false, raison: 'format' };
  return {
    ok: true,
    fichier: { sousTitres: r.sousTitres.slice(0, SOUS_TITRES_MAX), bom: d.bom, finDeLigne },
    import: null,
    blocsIllisibles: r.illisibles,
  };
}

export function ecrireSrt(f: Fichier): Uint8Array {
  const texte = f.sousTitres
    .map((s, i) => `${i + 1}\n${ecrireTemps(s.debut)} --> ${ecrireTemps(s.fin)}\n${s.texte}`)
    .join('\n\n');
  const complet = texte === '' ? '' : texte + '\n';
  const corps = new TextEncoder().encode(f.finDeLigne === '\n' ? complet : complet.replace(/\n/g, '\r\n'));
  if (!f.bom) return corps;
  const out = new Uint8Array(corps.length + 3);
  out.set(BOM);
  out.set(corps, 3);
  return out;
}
