/**
 * safe — les lectures BORNÉES, partagées par la configuration et les documents.
 *
 * L'ADVERSAIRE est le fichier. Un coffre partagé peut contenir un document
 * fabriqué par quelqu'un d'autre : il ne doit pouvoir ni faire tomber l'éditeur
 * (taille, imbrication), ni toucher aux prototypes de la page (`__proto__`,
 * `constructor`, `prototype`), ni être réécrit autrement qu'il n'a été lu.
 *
 * `scanJson` passe sur le texte AVANT `JSON.parse` : il compte l'imbrication,
 * refuse les clés interdites, repère les clés en double (que `JSON.parse`
 * fusionnerait en silence) et les nombres que JavaScript ne relirait pas à
 * l'identique. Ces deux derniers cas ne sont pas des attaques : ils ouvrent le
 * document en LECTURE SEULE, pour ne rien altérer.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_DEPTH = 12;
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.includes(key);
}

export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Un objet « ordinaire » : ni tableau, ni prototype détourné. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export interface JsonScan {
  ok: boolean;
  /** Code d'échec : `too_deep`, `forbidden_key`, `invalid_json`. */
  code?: 'too_deep' | 'forbidden_key' | 'invalid_json';
  detail?: string;
  /** Une clé apparaît deux fois dans un même objet. */
  duplicateKey?: string;
  /** Un nombre perdrait des chiffres à la relecture. */
  imprecise?: string;
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);

/**
 * Le passage de garde sur un texte JSON. Ne construit aucune valeur ; rend la
 * première raison de refus, ou les deux raisons de lecture seule.
 */
export function scanJson(text: string, maxDepth = MAX_DEPTH): JsonScan {
  const result: JsonScan = { ok: true };
  // Une pile : pour chaque conteneur ouvert, `null` (tableau) ou ses clés (objet).
  const stack: (Set<string> | null)[] = [];
  let expectKey = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
      stack.push(c === 0x7b ? new Set() : null);
      if (stack.length > maxDepth) {
        return { ok: false, code: 'too_deep', detail: `plus de ${maxDepth} niveaux d'imbrication` };
      }
      expectKey = c === 0x7b;
      i++;
      continue;
    }
    if (c === 0x7d /* } */ || c === 0x5d /* ] */) {
      stack.pop();
      expectKey = false;
      i++;
      continue;
    }
    if (c === 0x2c /* , */) {
      expectKey = stack.length > 0 && stack[stack.length - 1] !== null;
      i++;
      continue;
    }
    if (c === 0x3a /* : */) {
      expectKey = false;
      i++;
      continue;
    }
    if (c === 0x22 /* " */) {
      let j = i + 1;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 0x5c) j += 2;
        else if (d === 0x22) break;
        else j++;
      }
      if (j >= n) return { ok: false, code: 'invalid_json', detail: 'chaîne non fermée' };
      if (expectKey) {
        let key: string;
        try {
          key = JSON.parse(text.slice(i, j + 1)) as string;
        } catch {
          return { ok: false, code: 'invalid_json', detail: 'clé mal formée' };
        }
        if (isForbiddenKey(key)) return { ok: false, code: 'forbidden_key', detail: key };
        const keys = stack[stack.length - 1];
        if (keys) {
          if (keys.has(key) && result.duplicateKey === undefined) result.duplicateKey = key;
          keys.add(key);
        }
        expectKey = false;
      }
      i = j + 1;
      continue;
    }
    if (c === 0x2d /* - */ || (c >= 0x30 && c <= 0x39)) {
      let j = i + 1;
      while (j < n) {
        const d = text.charCodeAt(j);
        if ((d >= 0x30 && d <= 0x39) || d === 0x2e || d === 0x65 || d === 0x45 || d === 0x2b || d === 0x2d) j++;
        else break;
      }
      const token = text.slice(i, j);
      if (result.imprecise === undefined && !roundTrips(token)) result.imprecise = token;
      i = j;
      continue;
    }
    // true, false, null, ou une faute que JSON.parse dira mieux que nous.
    i++;
  }
  return result;
}

/** Le nombre se relit-il sans perte ? (Les écritures différentes d'une même valeur, oui.) */
function roundTrips(token: string): boolean {
  const digits = token.replace(/^-/, '').split(/[eE]/)[0];
  const significant = digits.replace('.', '').replace(/^0+/, '');
  if (!/[.eE]/.test(token)) {
    return significant.length <= 15 || Number.isSafeInteger(Number(token));
  }
  return significant.length <= 17;
}

/**
 * Parcourt une valeur déjà construite et vérifie ses objets : clés permises,
 * prototypes ordinaires, imbrication bornée. Sert aux valeurs qui ne passent
 * PAS par du texte — la configuration posée par `__filarrNocodeBoot(…)`, où un
 * littéral `"__proto__": …` aurait déjà changé un prototype au lieu de créer
 * une clé.
 */
export function checkValueTree(
  value: unknown,
  maxDepth = MAX_DEPTH,
  path = ''
): { ok: true } | { ok: false; path: string; reason: string } {
  const visit = (v: unknown, depth: number, p: string): { ok: true } | { ok: false; path: string; reason: string } => {
    if (typeof v !== 'object' || v === null) return { ok: true };
    if (depth > maxDepth) return { ok: false, path: p, reason: `plus de ${maxDepth} niveaux d'imbrication` };
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype) return { ok: false, path: p, reason: 'tableau au prototype détourné' };
      for (let i = 0; i < v.length; i++) {
        const r = visit(v[i], depth + 1, `${p}[${i}]`);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    if (!isPlainObject(v)) return { ok: false, path: p, reason: 'objet au prototype détourné' };
    for (const k of Object.keys(v)) {
      if (isForbiddenKey(k)) return { ok: false, path: p, reason: `clé interdite « ${k} »` };
      const r = visit(v[k], depth + 1, p ? `${p}.${k}` : k);
      if (!r.ok) return r;
    }
    return { ok: true };
  };
  return visit(value, 1, path);
}

const DECODER_OPTIONS = { fatal: true } as const;

/**
 * Les octets d'un document en texte : bornés en taille, UTF-8 strict (un
 * fichier binaire n'est pas « presque du texte »), marque d'ordre gardée à
 * part pour être réécrite telle quelle.
 */
export function decodeText(
  bytes: Uint8Array
): { ok: true; text: string; bom: boolean } | { ok: false; code: 'too_large' | 'not_utf8' } {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, code: 'too_large' };
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', DECODER_OPTIONS).decode(bom ? bytes.subarray(3) : bytes);
    return { ok: true, text, bom };
  } catch {
    return { ok: false, code: 'not_utf8' };
  }
}

const ENCODER = /* @__PURE__ */ new TextEncoder();

export function encodeText(text: string, bom: boolean): Uint8Array {
  const body = ENCODER.encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

/** La fin de ligne dominante d'un texte (`\r\n` si la première en est une). */
export function detectEol(text: string): '\n' | '\r\n' {
  const i = text.indexOf('\n');
  return i > 0 && text.charCodeAt(i - 1) === 0x0d ? '\r\n' : '\n';
}
