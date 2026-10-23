/**
 * images — les captures d'une fiche, jugées sur leurs OCTETS.
 *
 * PACKAGE.md : PNG, JPEG ou WebP, 96 Kio chacune, 4 au plus. Le type se lit
 * dans l'en-tête, jamais dans le nom (pas de SVG : c'est un document, qui peut
 * porter des scripts).
 */

import { MAX_SCREENSHOT_BYTES, sniffImage, type ImageInfo } from '@filarr/extension-api';
import { formatBytes, type Report } from './report';

export function checkScreenshot(bytes: Uint8Array, label: string, report: Report): ImageInfo | null {
  const info = sniffImage(bytes);
  if (!info) {
    report.error('screenshot_type', `${label} : ni PNG, ni JPEG, ni WebP (lu dans les octets)`, label);
    return null;
  }
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES) {
    report.error('screenshot_too_large', `${label} : ${formatBytes(bytes.byteLength)}, plus de 96 Kio`, label);
    return null;
  }
  const dims = info.width && info.height ? `${info.width}×${info.height}` : 'taille illisible';
  report.ok('screenshot', `${label} : ${info.mime.replace('image/', '').toUpperCase()}, ${dims}, ${formatBytes(bytes.byteLength)}`);
  if (info.mime === 'image/jpeg') {
    // Le worker n'accepte aujourd'hui en aperçu que des data URL PNG ou WebP
    // (`isPreviewImage`, layoutMarketTypesCore.ts) : un JPEG devra être réencodé par Filarr.
    report.warn('screenshot_jpeg', `${label} : JPEG accepté par le paquet, mais le serveur ne garde que PNG et WebP en aperçu — préférez WebP`, label);
  }
  return info;
}
