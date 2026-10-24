/**
 * textformats — lire un fichier d'EXEMPLE pour en deviner la forme.
 *
 * Ce n'est pas le moteur : le moteur lit et réécrit les documents de
 * l'utilisateur (packages/nocode-engine/src/formats), avec toutes ses
 * garanties. Ici on lit seulement l'exemple que l'auteur a montré, pour
 * proposer des champs ; rien n'est réécrit. Les mêmes bornes s'appliquent
 * quand même (taille, clés interdites) : un exemple reçu d'ailleurs reste une
 * donnée.
 */

export const MAX_SAMPLE_BYTES = 8 * 1024 * 1024;

/** Les lignes d'un CSV (guillemets doublés, sauts de ligne dans une cellule), bornées. */
export function parseCsv(text: string, delimiter: string, maxRows = 2000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const t = text.replace(/^﻿/, '');
  while (i < t.length && rows.length < maxRows) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"' && cell === '') {
      quoted = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '') || row.length > 1) rows.push(row);
      row = [];
      i += c === '\r' && t[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  return rows;
}

/** Le séparateur le plus fréquent de la première ligne (hors guillemets). */
export function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of firstLine) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c]++;
  }
  const best = (Object.entries(counts) as [',' | ';' | '\t', number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

export const COMMENT_RE = /^\s*(#|;|\/\/)/;

/** Les paires d'un fichier « clé: valeur », dans l'ordre (doublons compris). */
export function parseKeyValue(text: string, separator: ':' | '='): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (line.trim() === '' || COMMENT_RE.test(line)) continue;
    const i = line.indexOf(separator);
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (key) out.push({ key, value: line.slice(i + 1).trim() });
  }
  return out;
}

export function detectKeyValueSeparator(text: string): ':' | '=' {
  let colon = 0;
  let equal = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || COMMENT_RE.test(line)) continue;
    const c = line.indexOf(':');
    const e = line.indexOf('=');
    if (c > 0 && (e < 0 || c < e)) colon++;
    else if (e > 0) equal++;
  }
  return equal > colon ? '=' : ':';
}

export const LINE_ITEM_RE = /^\s*(?:[-*+]\s+)?\[( |x|X)\]\s?/;
