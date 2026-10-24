/**
 * screenshots — les captures de la fiche : PNG ou WebP en entrée (lus par
 * leurs OCTETS, jamais par leur nom ; JPEG refusé comme le refuse Filarr),
 * RÉENCODÉES en WebP sous 96 Kio. Le réencodage n'est pas qu'une affaire de
 * taille : il retire les métadonnées (lieu, appareil) qu'une image peut porter.
 *
 * Le navigateur encode par `canvas.toBlob('image/webp')`. Là où il ne sait pas
 * (il rend alors un PNG), on garde un PNG sous 96 Kio : PACKAGE.md admet PNG et
 * WebP, l'entrée s'appelle `screenshots/N.webp` dans les deux cas.
 */

import { MAX_SCREENSHOT_BYTES, sniffImage } from '@filarr/extension-api';

export class ScreenshotError extends Error {
  constructor(readonly code: 'type' | 'jpeg' | 'decode' | 'too_large', message: string) {
    super(message);
  }
}

/** Juge l'image reçue avant tout décodage. */
export function acceptScreenshotInput(bytes: Uint8Array): 'image/png' | 'image/webp' {
  const info = sniffImage(bytes);
  if (!info) throw new ScreenshotError('type', 'ni PNG, ni WebP (lu dans les octets du fichier)');
  if (info.mime === 'image/jpeg') throw new ScreenshotError('jpeg', 'JPEG refusé : Filarr n’accepte que PNG ou WebP en aperçu');
  return info.mime;
}

export interface Encoder {
  /** Dessine l'image à la largeur demandée et l'encode ; rend les octets produits. */
  encode(width: number, quality: number): Promise<Uint8Array>;
  width: number;
}

/**
 * Cherche le meilleur encodage sous la borne : qualité décroissante, puis
 * largeur réduite. Séparé du canvas pour être testé.
 */
export async function fitUnder(enc: Encoder, max = MAX_SCREENSHOT_BYTES): Promise<Uint8Array> {
  const widths = [enc.width, 1600, 1280, 1024, 800, 640, 480].filter((w, i, a) => w <= enc.width && a.indexOf(w) === i);
  for (const w of widths) {
    for (const q of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const out = await enc.encode(w, q);
      if (out.byteLength <= max) return out;
      const mime = sniffImage(out)?.mime;
      if (mime === 'image/png') break; // la qualité ne change rien à un PNG : on réduit la taille
    }
  }
  throw new ScreenshotError('too_large', 'impossible de la faire tenir sous 96 Kio, même réduite');
}

export async function reencodeScreenshot(bytes: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number; mime: string; originalBytes: number }> {
  const mime = acceptScreenshotInput(bytes);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
  } catch {
    throw new ScreenshotError('decode', 'image illisible');
  }
  const ratio = bitmap.height / bitmap.width;
  const enc: Encoder = {
    width: Math.min(bitmap.width, 1920),
    async encode(width, quality) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(width * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ScreenshotError('decode', 'canvas indisponible');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', quality));
      if (!blob) throw new ScreenshotError('decode', 'encodage impossible');
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
  const out = await fitUnder(enc);
  const info = sniffImage(out);
  bitmap.close();
  return { bytes: out, width: info?.width ?? 0, height: info?.height ?? 0, mime: info?.mime ?? 'image/webp', originalBytes: bytes.byteLength };
}
