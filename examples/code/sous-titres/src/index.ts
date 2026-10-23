/**
 * Sous-titres — éditer des `.srt`, et importer des `.vtt`.
 *
 * Ce que l'exemple montre :
 *  - `imports: ["vtt"]` : Filarr ouvre aussi les WebVTT avec cet éditeur, et
 *    la première sauvegarde crée un `.srt` à côté de l'original (qui n'est
 *    jamais réécrit). L'éditeur lit les deux formats et n'écrit que le sien ;
 *  - `functions.extractText` : la recherche de Filarr trouve une réplique par
 *    ce qui est DIT, sans les numéros ni les temps ;
 *  - `functions.exports` : une transcription en texte, et les répliques en JSON.
 */

import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { fonctions } from './fonctions';
import { TEXTES, langueDe } from './i18n';
import { decaler, inserer, modifier, supprimer, trier } from './operations';
import { creerSauvegarde } from './sauvegarde';
import { ecrireSrt, lireSousTitres, type Fichier, type SousTitre } from './srt';
import { CSS } from './style';
import { creerVue } from './vue';

export const EDITOR_ID = 'sous-titres-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'st', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireSousTitres(host.initialBytes, host.fileName);
  if (!lu.ok) {
    racine.append(el('div', { classe: 'etat-alerte', attrs: { role: 'alert' }, texte: lu.raison === 'encodage' ? t.encodage : t.format }));
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

  const forme: Omit<Fichier, 'sousTitres'> = { bom: lu.fichier.bom, finDeLigne: lu.fichier.finDeLigne };
  let liste: SousTitre[] = lu.fichier.sousTitres;
  const octets = () => ecrireSrt({ ...forme, sousTitres: liste });

  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(octets()),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  /** Une mutation : `redessiner` quand la structure change, sinon on revalide seulement. */
  const muter = (suivante: SousTitre[], redessiner: boolean) => {
    if (host.readOnly || suivante === liste) return;
    liste = suivante;
    if (redessiner) vue.dessiner(liste);
    else vue.verifier(liste);
    sauvegarde.modifie();
  };

  const vue = creerVue({
    t,
    langue,
    lectureSeule: host.readOnly,
    rappels: {
      ajouter(apres) {
        const r = inserer(liste, apres);
        muter(r.liste, true);
        vue.focaliser(r.index, 'texte');
        vue.annoncer(t.insere(r.index + 1));
      },
      supprimer(i) {
        muter(supprimer(liste, i), true);
        vue.annoncer(t.supprime(i + 1));
        vue.focaliser(Math.min(i, liste.length - 1), 'texte');
      },
      temps: (i, champ, ms) => muter(modifier(liste, i, champ === 'debut' ? { debut: ms } : { fin: ms }), false),
      texte: (i, valeur) => muter(modifier(liste, i, { texte: valeur }), false),
      decaler: (ms) => muter(decaler(liste, ms), true),
      trier: () => muter(trier(liste), true),
    },
  });

  vue.outils.append(barre.statut);
  racine.append(vue.outils, barre.alerte);
  if (lu.import) racine.append(el('p', { classe: 'st-info', texte: t.importVtt(lu.import.reglagesIgnores, lu.import.blocsIgnores) }));
  if (lu.blocsIllisibles > 0) racine.append(el('p', { classe: 'st-info', texte: t.illisibles(lu.blocsIllisibles) }));
  racine.append(vue.zone);
  vue.dessiner(liste);

  ecoute.sur(racine, 'keydown', (e) => {
    if (!estRaccourciEnregistrer(e as KeyboardEvent)) return;
    e.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  return {
    destroy() {
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    // Toujours du SRT, même pour un `.vtt` importé : c'est le format de l'éditeur.
    getBytes: octets,
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = {
  editors: ids.map((id) => ({ id, mount })),
  functions: fonctions,
};
