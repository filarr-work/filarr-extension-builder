/**
 * salle — la co-édition en direct, selon le motif de `docs/contract/API.md` §3.
 *
 * L'extension tient SON `Y.Doc` (Yjs est embarqué dans le bundle) et échange
 * des OCTETS avec l'hôte ; elle ne reçoit jamais le document de la salle, ni
 * clé, ni jeton, ni présence. Le motif, étape par étape :
 *
 *   1. `const doc = new Y.Doc()` ;
 *   2. appliquer `host.collab.initialUpdates` (ce que la salle contient déjà) ;
 *   3. si `host.collab.seed` : construire le document depuis `initialBytes`,
 *      puis `seeded()`, UNE fois ;
 *   4. `doc.on('update', (u, origin) => origin !== 'remote' && sendUpdate(u))` ;
 *   5. `onRemoteUpdate((u) => Y.applyUpdate(doc, u, 'remote'))` ;
 *   6. n'enregistrer par `saveBytes` que si `isResponsible()` (voir index.ts).
 *
 * UNE précision d'ordre, que le texte d'API.md laisse ouverte : l'écouteur de
 * l'étape 4 est posé AVANT le semis de l'étape 3. Posé après, l'update du semis
 * ne partirait jamais, et les autres pages verraient une salle vide. Le semis
 * se fait par lots, chacun sous le plafond d'1 Mio par update.
 *
 * Sans `host.collab` (pas de capacité accordée, pas de salle, ou un document
 * hors coffre partagé), le même `Y.Doc` sert seul : rien ne part, et
 * l'éditeur se comporte comme n'importe quel éditeur mono-utilisateur.
 *
 * Ce qui n'est pas garanti, et que l'hôte écrit lui-même : une update ne se
 * valide pas. On revalide donc chaque élément reçu à la lecture (`depuisDoc`),
 * comme s'il venait d'un fichier inconnu.
 */

import * as Y from 'yjs';
import { elementsDe, type Element, type Tableau } from './tableau';

/** L'origine des updates des autres — le nom qu'emploie API.md. */
export const DISTANT = 'remote';
/** Nos gestes : ce que l'historique (annuler, rétablir) suit. */
export const LOCAL = 'local';
/** La construction depuis le fichier : ni un geste, ni une modification à enregistrer. */
export const SEMIS = 'semis';

/** Sous le plafond d'1 Mio par update (`COLLAB_SEND_MAX`), avec de la marge. */
const LOT_OCTETS = 256 * 1024;

export interface Salle {
  doc: Y.Doc;
  enSalle: boolean;
  detruire(): void;
}

/** Verse le tableau par lots : chaque lot est une transaction, donc une update bornée. */
export function semerParLots(doc: Y.Doc, t: Tableau): void {
  const map = elementsDe(doc);
  const meta = doc.getMap<number>('meta');
  let lot: Element[] = [];
  let taille = 0;
  const vider = (premier: boolean) => {
    doc.transact(() => {
      if (premier) {
        meta.set('largeur', t.largeur);
        meta.set('hauteur', t.hauteur);
      }
      for (const e of lot) map.set(e.id, e);
    }, SEMIS);
    lot = [];
    taille = 0;
  };
  let premier = true;
  for (const e of t.elements) {
    const n = JSON.stringify(e).length;
    if (taille + n > LOT_OCTETS && lot.length) {
      vider(premier);
      premier = false;
    }
    lot.push(e);
    taille += n;
  }
  if (lot.length || premier) vider(premier);
}

export function ouvrirSalle(host: FilarrHost, tableau: Tableau, surRefus: (code: string) => void): Salle {
  const doc = new Y.Doc();
  const collab = host.collab;

  if (!collab) {
    semerParLots(doc, tableau);
    return { doc, enSalle: false, detruire: () => doc.destroy() };
  }

  const desabonnements: (() => void)[] = [];

  // 2. Ce que la salle contient déjà, avant tout.
  for (const u of collab.initialUpdates) Y.applyUpdate(doc, u, DISTANT);

  // 4. Nos updates partent — sauf celles qui viennent des autres. Un lecteur
  //    n'envoie rien : `sendUpdate` jetterait `read_only`.
  const envoyer = (u: Uint8Array, origine: unknown) => {
    if (origine === DISTANT || host.readOnly) return;
    try {
      collab.sendUpdate(u);
    } catch (e) {
      surRefus(String((e as Error)?.message ?? e));
    }
  };
  doc.on('update', envoyer);
  desabonnements.push(() => doc.off('update', envoyer));

  // 3. Une salle vide : c'est à cette page de la semer, depuis le fichier.
  if (collab.seed && !host.readOnly) {
    semerParLots(doc, tableau);
    collab.seeded();
  } else if (collab.seed) {
    // Un lecteur à qui l'on demanderait de semer : il montre le fichier, mais
    // ne prétend pas avoir semé la salle (il ne peut rien y envoyer).
    semerParLots(doc, tableau);
  }

  // 5. Les updates des autres. Celles arrivées avant cet abonnement sont rejouées par la page.
  desabonnements.push(collab.onRemoteUpdate((u) => Y.applyUpdate(doc, u, DISTANT)));

  return {
    doc,
    enSalle: true,
    detruire() {
      for (const d of desabonnements) d();
      doc.destroy();
    },
  };
}
