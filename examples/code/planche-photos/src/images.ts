/**
 * images — reconnaître une image par ses OCTETS, lire ses dimensions dans son
 * en-tête, et passer d'octets en data URL. Pur : aucun décodage de pixels.
 *
 * Pourquoi par les octets : le sélecteur de Filarr ne propose que les
 * extensions déclarées (`png`, `jpg`, `jpeg`, `webp`), mais un nom de fichier
 * ne prouve rien. Un « .png » qui n'en est pas un est refusé avec son nom, et
 * une data URL lue dans un fichier `.planche` n'est acceptée que si son type
 * annoncé correspond à ses octets — c'est ce qui la rend sûre dans un `src`.
 */

export type TypeImage = 'png' | 'jpeg' | 'webp';

export const MIME: Record<TypeImage, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

export function typeImage(o: Uint8Array): TypeImage | null {
  if (o.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => o[i] === b)) return 'png';
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpeg';
  const ascii = (a: number, b: number) => String.fromCharCode(...o.subarray(a, b));
  if (o.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Largeur et hauteur, lues dans l'en-tête ; `null` si l'en-tête est tronqué ou inconnu. */
export function dimensions(o: Uint8Array): { largeur: number; hauteur: number } | null {
  const t = typeImage(o);
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const ok = (l: number, h: number) => (l > 0 && h > 0 ? { largeur: l, hauteur: h } : null);
  try {
    if (t === 'png') return o.length >= 24 ? ok(v.getUint32(16), v.getUint32(20)) : null;
    if (t === 'jpeg') {
      let p = 2;
      while (p + 9 < o.length) {
        if (o[p] !== 0xff) return null;
        const m = o[p + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
          p += 2;
          continue;
        }
        // Les marqueurs SOF (C0 à CF, sauf C4, C8 et CC) portent les dimensions.
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(v.getUint16(p + 7), v.getUint16(p + 5));
        p += 2 + v.getUint16(p + 2);
      }
      return null;
    }
    if (t === 'webp') {
      const bloc = String.fromCharCode(...o.subarray(12, 16));
      if (bloc === 'VP8X' && o.length >= 30) {
        const u24 = (i: number) => o[i] | (o[i + 1] << 8) | (o[i + 2] << 16);
        return ok(1 + u24(24), 1 + u24(27));
      }
      if (bloc === 'VP8L' && o.length >= 25) {
        const [b0, b1, b2, b3] = [o[21], o[22], o[23], o[24]];
        return ok(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
      }
      if (bloc === 'VP8 ' && o.length >= 30) return ok(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff);
    }
  } catch {
    return null;
  }
  return null;
}

export function versBase64(o: Uint8Array): string {
  let s = '';
  const PAS = 0x8000;
  for (let i = 0; i < o.length; i += PAS) s += String.fromCharCode(...o.subarray(i, i + PAS));
  return btoa(s);
}

export function depuisBase64(b64: string): Uint8Array | null {
  try {
    const s = atob(b64);
    const o = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  } catch {
    return null;
  }
}

export function dataUrl(o: Uint8Array, t: TypeImage): string {
  return `data:${MIME[t]};base64,${versBase64(o)}`;
}

const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Une data URL d'image VÉRIFIÉE : son type annoncé est celui de ses octets. */
export function lireDataUrl(s: unknown, max: number): { type: TypeImage; octets: Uint8Array } | null {
  if (typeof s !== 'string' || s.length > max) return null;
  const m = DATA_URL_RE.exec(s);
  if (!m) return null;
  const octets = depuisBase64(m[2]);
  if (!octets || typeImage(octets) !== m[1]) return null;
  return { type: m[1] as TypeImage, octets };
}

/** Les dimensions d'une réduction qui tient dans `max` × `max`, sans agrandir. */
export function reduction(l: number, h: number, max: number): { largeur: number; hauteur: number } {
  const s = Math.min(1, max / Math.max(l, h));
  return { largeur: Math.max(1, Math.round(l * s)), hauteur: Math.max(1, Math.round(h * s)) };
}
