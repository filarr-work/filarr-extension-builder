/**
 * Croquis — le dessin à main levée (`.croquis`), avec annuler et rétablir.
 *
 * Ce que l'exemple montre, au-delà d'un éditeur :
 *  - `newDocument` : « Nouveau document › Croquis vierge » crée un fichier à
 *    partir d'une GRAINE (le JSON d'un croquis vide), et non d'un fichier de
 *    0 octet ;
 *  - `functions.thumbnail` : la carte du fichier montre le dessin, calculé
 *    sans ouvrir l'éditeur (`fonctions.ts`, PNG encodé à la main) ;
 *  - `functions.exports` : « Exporter en page web » (SVG embarqué) et en JSON ;
 *  - `maxBytes` relevé : un dessin riche dépasse vite ce qu'un éditeur
 *    ordinaire accepte d'ouvrir.
 */

import { ecrireCroquis, lireCroquis } from './croquis';
import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { fonctions } from './fonctions';
import { ajouterTrait, annuler, appliquer, effacerTout, historique, retablir, type Historique } from './historique';
import { TEXTES, langueDe } from './i18n';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';
import { creerVue } from './vue';

export const EDITOR_ID = 'croquis-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'cq', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireCroquis(host.initialBytes);
  if (!lu.ok) {
    const message = typeof lu.raison === 'object' ? t.versionInconnue(lu.raison.version) : t.illisible;
    racine.append(el('div', { classe: 'etat-alerte', attrs: { role: 'alert' }, texte: message }));
    const original = host.initialBytes.slice();
    return {
      destroy() {
        desabonnerTheme();
        racine.remove();
        style.remove();
      },
      getBytes: () => original.slice(),
    };
  }

  let h: Historique = historique(lu.croquis);
  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrireCroquis(h.present)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  /** Annuler et rétablir sont des MUTATIONS comme les autres : saleté et autosave. */
  const passer = (suivant: Historique) => {
    if (host.readOnly || suivant === h) return;
    h = suivant;
    vue.actualiser(h.present, h.passe.length > 0, h.futur.length > 0);
    sauvegarde.modifie();
  };

  const vue = creerVue({
    t,
    lectureSeule: host.readOnly,
    rappels: {
      tracer: (trait) => passer(appliquer(h, ajouterTrait(h.present, trait))),
      annuler: () => passer(annuler(h)),
      retablir: () => passer(retablir(h)),
      effacer: () => passer(appliquer(h, effacerTout(h.present))),
    },
  });

  vue.outils.append(barre.statut);
  racine.append(vue.outils, barre.alerte);
  if (lu.repare) racine.append(el('p', { classe: 'cq-info', texte: t.repare }));
  racine.append(vue.feuille);
  vue.actualiser(h.present, false, false);

  ecoute.sur(racine, 'keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if (estRaccourciEnregistrer(e)) {
      e.preventDefault();
      if (!host.readOnly) sauvegarde.maintenant();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || host.readOnly) return;
    const cle = e.key.toLowerCase();
    if (cle === 'z' && !e.shiftKey) {
      e.preventDefault();
      passer(annuler(h));
    } else if ((cle === 'z' && e.shiftKey) || cle === 'y') {
      e.preventDefault();
      passer(retablir(h));
    }
  });

  return {
    destroy() {
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: () => ecrireCroquis(h.present),
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = {
  editors: ids.map((id) => ({ id, mount })),
  functions: fonctions,
};
