/**
 * reduction — une image choisie devient une VIGNETTE embarquée.
 *
 * Dans la page bac à sable, `createImageBitmap` et `<canvas>` décodent et
 * réduisent l'image : pas de réseau, pas d'URL, des octets qui entrent et une
 * data URL JPEG qui sort (fond blanc sous la transparence, qualité 0,82).
 * L'original, lui, n'est jamais gardé.
 *
 * Sans `<canvas>` utilisable (un environnement de test, un navigateur qui le
 * refuse), une image déjà petite est embarquée telle quelle — ses octets ont
 * été vérifiés — et une grande est refusée avec un code, plutôt que
 * d'alourdir le document de plusieurs mégaoctets.
 */

import { MIME, dataUrl, dimensions, reduction, type TypeImage } from './images';

/** Au-delà, sans pouvoir réduire, on refuse : la planche resterait trop lourde. */
export const TEL_QUEL_MAX = 256 * 1024;

export interface Vignette {
  image: string;
  largeur: number;
  hauteur: number;
}

async function parCanvas(octets: Uint8Array, type: TypeImage, max: number): Promise<Vignette | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([octets as BlobPart], { type: MIME[type] }));
  } catch {
    return null;
  }
  try {
    const { largeur, hauteur } = reduction(bitmap.width, bitmap.height, max);
    const toile = document.createElement('canvas');
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    const image = toile.toDataURL('image/jpeg', 0.82);
    return image.startsWith('data:image/jpeg;base64,') ? { image, largeur, hauteur } : null;
  } finally {
    bitmap.close();
  }
}

/** Rejette avec un CODE : `image_illisible` ou `image_trop_grande`. */
export async function reduire(octets: Uint8Array, type: TypeImage, max: number): Promise<Vignette> {
  const v = await parCanvas(octets, type, max);
  if (v) return v;
  const d = dimensions(octets);
  if (!d) throw new Error('image_illisible');
  if (octets.byteLength > TEL_QUEL_MAX) throw new Error('image_trop_grande');
  return { image: dataUrl(octets, type), largeur: d.largeur, hauteur: d.hauteur };
}
