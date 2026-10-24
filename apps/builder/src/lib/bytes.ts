/**
 * bytes — octets, texte et empreintes. Un projet du Builder est une carte
 * chemin → octets : le texte n'en est qu'une lecture.
 */

const ENC = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return ENC.encode(s);
}

/** Lecture tolérante (aperçus, éditeur). */
export function text(b: Uint8Array | undefined): string {
  return b ? new TextDecoder('utf-8').decode(b) : '';
}

/** Lecture stricte : `null` si ce n'est pas de l'UTF-8 (un fichier binaire). */
export function strictText(b: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return null;
  }
}

/** Un fichier est-il du texte qu'on peut éditer ? (UTF-8 valide, sans octet nul.) */
export function isTextFile(path: string, b: Uint8Array): boolean {
  if (/\.(png|jpe?g|webp|gif|ico|bin|zip|filarrext|wasm|pdf)$/i.test(path)) return false;
  if (b.includes(0)) return false;
  return strictText(b) !== null;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Les tailles comme Filarr les écrit : Kio, Mio, virgule décimale en français. */
export function formatBytes(n: number, lang: 'fr' | 'en' = 'fr'): string {
  const dec = (x: number, d: number) => (lang === 'fr' ? x.toFixed(d).replace('.', ',') : x.toFixed(d));
  if (n < 1024) return lang === 'fr' ? `${n} o` : `${n} B`;
  if (n < 1024 * 1024) return `${dec(n / 1024, 1)} ${lang === 'fr' ? 'Kio' : 'KiB'}`;
  return `${dec(n / 1024 / 1024, 2)} ${lang === 'fr' ? 'Mio' : 'MiB'}`;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
