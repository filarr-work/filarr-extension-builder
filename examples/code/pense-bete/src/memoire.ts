/**
 * memoire — les préférences d'affichage, branchées sur `host.storage`.
 *
 * `host.storage` n'existe que si la capacité a été déclarée ET acceptée : on
 * teste sa présence, et sans lui l'extension fonctionne à l'identique — les
 * préférences vivent alors le temps de la session, en mémoire.
 *
 * Une écriture à la fois : le pont limite le débit des requêtes (rafale de
 * 40, 20 par seconde, 16 en vol). Un utilisateur qui replie dix notes d'affilée
 * ne déclenche pas dix écritures en vol : la dernière valeur part dès que la
 * précédente a répondu. Aucun minuteur, donc rien à oublier au démontage.
 */

import { codeDeRejet } from './sauvegarde';
import { CLE_PREFERENCES, ecrirePreferences, lirePreferences, preferencesParDefaut, type Preferences } from './preferences';

export interface MemoirePreferences {
  readonly valeur: Preferences;
  /** Lit le stockage une fois ; rend les défauts s'il est absent ou en panne. */
  charger(): Promise<Preferences>;
  changer(p: Preferences): void;
  detruire(): void;
}

/** `surPanne(code)` : le stockage a refusé (`storage_locked`, `quota_exceeded`…) ; `null` : il répond. */
export function creerMemoire(storage: FilarrStorage | undefined, surPanne: (code: string | null) => void): MemoirePreferences {
  let valeur = preferencesParDefaut();
  let enVol = false;
  let aRefaire = false;
  let detruit = false;

  const ecrire = () => {
    if (!storage || detruit) return;
    if (enVol) {
      aRefaire = true;
      return;
    }
    enVol = true;
    storage.set(CLE_PREFERENCES, ecrirePreferences(valeur)).then(
      () => {
        if (!detruit) surPanne(null);
      },
      (e) => {
        if (!detruit) surPanne(codeDeRejet(e));
      }
    ).finally(() => {
      enVol = false;
      if (aRefaire && !detruit) {
        aRefaire = false;
        ecrire();
      }
    });
  };

  return {
    get valeur() {
      return valeur;
    },
    async charger() {
      if (!storage) return valeur;
      try {
        valeur = lirePreferences(await storage.get(CLE_PREFERENCES));
      } catch (e) {
        if (!detruit) surPanne(codeDeRejet(e));
      }
      return valeur;
    },
    changer(p) {
      valeur = p;
      ecrire();
    },
    detruire() {
      detruit = true;
    },
  };
}
