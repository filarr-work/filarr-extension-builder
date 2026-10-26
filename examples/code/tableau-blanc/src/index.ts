/**
 * Tableau blanc — co-édition en direct (capacité `collab`), Yjs embarqué.
 *
 * Ce que l'exemple montre : le motif de `docs/contract/API.md` §3, à la lettre
 * (`salle.ts`), et ses trois conséquences pour un éditeur :
 *
 *  - le fichier reste du JSON (`tableau.ts`) : le `Y.Doc` n'est qu'un état de
 *    travail, construit depuis le fichier par la page qui SÈME la salle ;
 *  - seul l'ÉLU enregistre (`isResponsible()`), pour toute la salle — y compris
 *    les modifications des autres. Quand l'élu change, le nouveau reprend où
 *    l'ancien s'est arrêté (`onResponsibleChange` → `relancer`) ;
 *  - annuler ne défait que SES gestes (`Y.UndoManager` limité à l'origine
 *    locale) : on n'efface pas le trait que quelqu'un d'autre vient de tracer.
 *
 * Sans `host.collab` — pas de capacité accordée, pas de coffre partagé —
 * l'éditeur fonctionne seul, à l'identique.
 */

import * as Y from 'yjs';
import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import { DISTANT, LOCAL, SEMIS, ouvrirSalle } from './salle';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';
import { deplace, depuisDoc, ecrireTableau, elementsDe, lireElement, lireTableau, nouvelId, poser, retirer, zSuivant } from './tableau';
import { creerVue } from './vue';

export const EDITOR_ID = 'tableau-blanc-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'tb', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireTableau(host.initialBytes);
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

  const collab = host.collab;
  const barre = creerBarreEtat(t, langue, host.readOnly);
  const refus = el('p', { classe: 'tb-refus', attrs: { role: 'alert' } });
  refus.hidden = true;
  const salle = ouvrirSalle(host, lu.tableau, (code) => {
    refus.textContent = t.refusSalle(code);
    refus.hidden = false;
  });
  const doc = salle.doc;
  const octets = () => ecrireTableau(depuisDoc(doc));

  // 6. N'enregistrer par saveBytes que si cette page est l'élue de la salle.
  const estElu = () => !collab || collab.isResponsible();
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    peutEnregistrer: estElu,
    enregistrer: () => host.saveBytes(octets()),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });
  const direQuiEnregistre = () => {
    if (collab && !host.readOnly && !collab.isResponsible()) barre.statut.textContent = t.autreEnregistre;
  };

  // Annuler ne défait que nos gestes : l'historique suit l'origine locale, pas les autres.
  const historique = new Y.UndoManager(elementsDe(doc), { trackedOrigins: new Set([LOCAL]) });

  const vue = creerVue({
    t,
    lectureSeule: host.readOnly,
    enSalle: salle.enSalle,
    rappels: {
      tracer(points, couleur) {
        const e = lireElement({ id: nouvelId(), type: 'trait', z: zSuivant(doc), couleur, epaisseur: 4, points });
        if (e) poser(doc, e, LOCAL);
      },
      ajouterTexte(couleur) {
        const id = nouvelId();
        const n = elementsDe(doc).size;
        const e = lireElement({ id, type: 'texte', z: zSuivant(doc), couleur, x: 120 + (n % 8) * 40, y: 120 + (n % 8) * 40, texte: t.texteDefaut });
        if (!e) return;
        poser(doc, e, LOCAL);
        vue.selectionner(id);
        vue.annoncer(t.ajoute);
      },
      deplacer(id, dx, dy) {
        const e = elementsDe(doc).get(id);
        const propre = e ? lireElement(e) : null;
        if (propre) poser(doc, deplace(propre, dx, dy), LOCAL);
      },
      supprimer(id) {
        retirer(doc, id, LOCAL);
        vue.selectionner(null);
        vue.annoncer(t.supprime);
      },
      ecrire(id, texte) {
        const e = elementsDe(doc).get(id);
        const propre = e ? lireElement(e) : null;
        if (propre?.type === 'texte') poser(doc, { ...propre, texte: texte.replace(/[\r\n]+/g, ' ').slice(0, 500) }, LOCAL);
      },
      annuler: () => historique.undo(),
      retablir: () => historique.redo(),
    },
  });

  racine.append(vue.outils, el('div', { classe: 'tb-etat' }, [barre.statut]), barre.alerte, refus);
  if (lu.repare) racine.append(el('p', { classe: 'tb-info', texte: t.repare }));
  racine.append(vue.zone);

  const actualiser = () => {
    vue.dessiner(depuisDoc(doc));
    vue.etatHistorique(historique.canUndo(), historique.canRedo());
  };
  actualiser();
  direQuiEnregistre();

  // Toute transaction qui change le document : on redessine ; et si ce n'est
  // pas le semis, c'est une modification à enregistrer — la nôtre ou celle
  // d'un autre (l'élu enregistre pour toute la salle).
  const surTransaction = (tr: Y.Transaction) => {
    if (tr.changed.size === 0) return;
    actualiser();
    if (tr.origin === SEMIS) return;
    if (tr.origin !== DISTANT || estElu()) sauvegarde.modifie();
    direQuiEnregistre();
  };
  doc.on('afterTransaction', surTransaction);

  const desabonnerElu = collab
    ? collab.onResponsibleChange((elu) => {
        if (elu) sauvegarde.relancer();
        else direQuiEnregistre();
      })
    : () => undefined;

  ecoute.sur(racine, 'keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if (estRaccourciEnregistrer(e)) {
      e.preventDefault();
      if (!host.readOnly) sauvegarde.maintenant();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || host.readOnly || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const cle = e.key.toLowerCase();
    if (cle === 'z' && !e.shiftKey) {
      e.preventDefault();
      historique.undo();
    } else if ((cle === 'z' && e.shiftKey) || cle === 'y') {
      e.preventDefault();
      historique.redo();
    }
  });

  return {
    destroy() {
      sauvegarde.detruire();
      desabonnerElu();
      doc.off('afterTransaction', surTransaction);
      historique.destroy();
      salle.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: octets,
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
