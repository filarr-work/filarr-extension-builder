/**
 * images — les captures d'une fiche, jugées sur leurs OCTETS.
 *
 * PACKAGE.md : PNG ou WebP, 96 Kio chacune, 4 au plus — les seuls formats que
 * le manifeste accepte en aperçu (`isPreviewImage` de Filarr). Le type se lit
 * dans l'en-tête, jamais dans le nom (pas de SVG : c'est un document, qui peut
 * porter des scripts). Un JPEG est reconnu pour le DIRE, puis refusé.
 */

import { MAX_SCREENSHOT_BYTES, sniffImage, type ImageInfo } from '@filarr/extension-api';
import { formatBytes, type Report } from './report';

export function checkScreenshot(bytes: Uint8Array, label: string, report: Report): ImageInfo | null {
  const info = sniffImage(bytes);
  if (!info) {
    report.error('screenshot_type', `${label} : ni PNG, ni WebP (lu dans les octets)`, label);
    return null;
  }
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES) {
    report.error('screenshot_too_large', `${label} : ${formatBytes(bytes.byteLength)}, plus de 96 Kio`, label);
    return null;
  }
  if (info.mime === 'image/jpeg') {
    // Filarr refuse le paquet : le manifeste n'accepte en aperçu que PNG et WebP.
    report.error('screenshot_jpeg', `${label} : JPEG refusé — Filarr n'accepte que PNG ou WebP en aperçu ; réencodez en WebP`, label);
    return null;
  }
  const dims = info.width && info.height ? `${info.width}×${info.height}` : 'taille illisible';
  report.ok('screenshot', `${label} : ${info.mime.replace('image/', '').toUpperCase()}, ${dims}, ${formatBytes(bytes.byteLength)}`);
  return info;
}
