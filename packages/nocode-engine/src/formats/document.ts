/**
 * document — ce que chaque format rend au moteur.
 */

import type { DocFormatContext, Scope } from '../model';

export type ReadOnlyReason =
  | { code: 'duplicate_key'; detail: string }
  | { code: 'imprecise_number'; detail: string };

export interface NocodeDocument {
  readonly root: Scope;
  readonly ctx: DocFormatContext;
  /** Le fichier était vide : un document neuf, bâti sur les valeurs par défaut. */
  readonly isNew: boolean;
  /**
   * Des raisons d'ouvrir en LECTURE SEULE : le fichier se lit, mais
   * l'enregistrer le changerait au-delà de ce que l'utilisateur a touché.
   */
  readonly readOnlyReasons: ReadOnlyReason[];
  /** Le fichier, réécrit : seules les valeurs touchées ont changé. */
  serialize(): Uint8Array;
}

export type DocumentFailureCode =
  | 'too_large'
  | 'not_utf8'
  | 'too_deep'
  | 'forbidden_key'
  | 'invalid_json'
  | 'not_object';

export type DocumentResult =
  | { ok: true; doc: NocodeDocument }
  | { ok: false; code: DocumentFailureCode; detail?: string };
