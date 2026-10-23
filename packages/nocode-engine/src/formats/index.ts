/**
 * formats — ouvrir un document dans le format que la configuration déclare.
 *
 * Le passage commun à tous : taille bornée (8 Mio), UTF-8 strict, marque
 * d'ordre gardée à part. Ensuite, chaque format garde ce qu'il ne comprend pas.
 */

import { decodeText } from '../safe';
import type { NocodeConfig } from '../types';
import { openCsv } from './csv';
import type { DocumentResult } from './document';
import { openJson } from './json';
import { openKeyValue } from './keyvalue';
import { openLines } from './lines';

export type { DocumentResult, NocodeDocument, ReadOnlyReason, DocumentFailureCode } from './document';

export function openDocument(bytes: Uint8Array, config: NocodeConfig): DocumentResult {
  const decoded = decodeText(bytes);
  if (!decoded.ok) return { ok: false, code: decoded.code };
  const { text, bom } = decoded;
  switch (config.format.type) {
    case 'json':
      return openJson(text, bom, config);
    case 'csv':
      return openCsv(text, bom, config);
    case 'lines':
      return openLines(text, bom, config);
    case 'keyvalue':
      return openKeyValue(text, bom, config);
  }
}
