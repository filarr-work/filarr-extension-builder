/**
 * Pense-bête — un tableau de notes repositionnables (`.postit`).
 *
 * Ce que l'exemple montre : la capacité `storage`, pour ce qu'elle est faite —
 * des PRÉFÉRENCES d'affichage (le zoom, les notes repliées), propres à cet
 * appareil, jamais le contenu. Le contenu va dans le fichier, par `saveBytes`,
 * comme pour tout éditeur. Et un déplacement au clavier aussi complet qu'à la
 * souris.
 */

import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import { creerMemoire } from './memoire';
import {
  ajouterNote,
  couleurSuivante,
  deplacerNote,
  ecrireNote,
  ecrirePenseBete,
  lirePenseBete,
  placeLibre,
  premierPlan,
  recolorerNote,
  supprimerNote,
  type Tableau,
} from './postit';
import { basculerRepli, zoomer } from './preferences';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';
import { creerVue } from './vue';

export const EDITOR_ID = 'pense-bete-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'pb', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lirePenseBete(host.initialBytes);
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

  let tableau: Tableau = lu.tableau;
  let detruit = false;
  const barre = creerBarreEtat(t, langue, host.readOnly);
  const notePrefs = el('span', { classe: 'pb-prefs' });
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrirePenseBete(tableau)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });
  // Le stockage est FACULTATIF : sans la capacité (ou sans compte, en test
  // local), les préférences vivent en mémoire le temps de la session.
  const memoire = creerMemoire(host.storage, (code) => {
    notePrefs.textContent = code ? t.prefsPanne(code) : '';
  });

  /** Toute modification du CONTENU passe par ici : modèle, vue, saleté, autosave. */
  const muter = (suivant: Tableau) => {
    if (host.readOnly || suivant === tableau) return;
    tableau = suivant;
    vue.actualiser(tableau, memoire.valeur);
    sauvegarde.modifie();
  };

  const vue = creerVue({
    t,
    lectureSeule: host.readOnly,
    rappels: {
      ajouter() {
        const { x, y } = placeLibre(tableau);
        const avant = tableau.notes.length;
        muter(ajouterNote(tableau, x, y, 'jaune'));
        const neuve = tableau.notes[tableau.notes.length - 1];
        if (tableau.notes.length > avant && neuve) {
          vue.annoncer(t.ajoutee);
          vue.focaliserTexte(neuve.id);
        }
      },
      deplacer(id, x, y) {
        muter(premierPlan(deplacerNote(tableau, id, x, y), id));
        const n = tableau.notes.find((m) => m.id === id);
        if (n) vue.annoncer(t.deplacee(n.x, n.y));
        vue.focaliserNote(id);
      },
      ecrire(id, texte) {
        muter(ecrireNote(tableau, id, texte));
      },
      recolorer(id) {
        const n = tableau.notes.find((m) => m.id === id);
        if (n) muter(recolorerNote(tableau, id, couleurSuivante(n.couleur)));
      },
      supprimer(id) {
        const i = tableau.notes.findIndex((n) => n.id === id);
        muter(supprimerNote(tableau, id));
        vue.annoncer(t.supprimee);
        const voisine = tableau.notes[Math.min(i, tableau.notes.length - 1)];
        vue.focaliserNote(voisine ? voisine.id : null);
      },
      // Replier et zoomer ne touchent PAS au document : permis en lecture seule.
      replier(id) {
        memoire.changer(basculerRepli(memoire.valeur, id));
        vue.actualiser(tableau, memoire.valeur);
      },
      zoomer(sens) {
        memoire.changer(zoomer(memoire.valeur, sens));
        vue.actualiser(tableau, memoire.valeur);
      },
    },
  });

  vue.barre.append(barre.statut, notePrefs);
  racine.append(vue.barre, barre.alerte);
  if (lu.repare) racine.append(el('p', { classe: 'pb-info', texte: t.repare }));
  racine.append(vue.zone);
  vue.actualiser(tableau, memoire.valeur);
  // Monté tout de suite, préférences appliquées ensuite : `mount` ne bloque
  // pas sur le stockage (l'hôte abandonne au bout de 15 s).
  void memoire.charger().then((p) => {
    if (!detruit) vue.actualiser(tableau, p);
  });

  ecoute.sur(racine, 'keydown', (e) => {
    if (!estRaccourciEnregistrer(e as KeyboardEvent)) return;
    e.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  return {
    destroy() {
      detruit = true;
      sauvegarde.detruire();
      memoire.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: () => ecrirePenseBete(tableau),
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
