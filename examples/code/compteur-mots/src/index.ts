/**
 * Compteur de mots — le démarrage rapide de Filarr, en TypeScript et testé.
 *
 * Une zone de texte, et sous les yeux : mots, caractères, temps de lecture.
 * Aucune capacité : l'extension ne reçoit que le document ouvert, et c'est
 * tout ce dont elle a besoin. Tout le contrat d'un éditeur est là, en petit :
 * document neuf, lecture seule, `onDirty`, autosave à 2 s, codes de rejet,
 * `getBytes` total, `destroy` qui rend tout, thème et langue de l'hôte.
 */

import { compter } from './compte';
import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';
import { ecrireTexte, lireTexte } from './texte';

/** L'hôte demande `<id du manifeste>-editor` (API.md §1) : ce n'est pas un style. */
export const EDITOR_ID = 'compteur-mots-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  // L'hôte possède le conteneur ; on le vide, puis on y construit par createElement.
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'wc', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireTexte(host.initialBytes);
  if (!lu.ok) {
    // Format non reconnu : on le DIT, et l'instance rend les octets d'origine
    // à l'identique — l'hôte appelle getBytes() à la fermeture, lui rendre
    // autre chose écraserait le fichier par la porte de derrière.
    const alerte = el('div', { classe: 'etat-alerte', attrs: { role: 'alert' }, texte: t.illisible });
    racine.append(alerte);
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

  const barre = creerBarreEtat(t, langue, host.readOnly);
  const stats = el('span', { classe: 'wc-stats', attrs: { id: 'wc-stats' } });
  const detail = el('span', { classe: 'wc-detail', attrs: { id: 'wc-detail' } });
  const zone = el('textarea', {
    classe: 'wc-zone',
    attrs: { 'aria-label': t.zone, 'aria-describedby': 'wc-stats wc-detail', spellcheck: 'true' },
  });
  // Un fichier de 0 octet est un document NEUF (menu « Nouveau document ») : texte vide.
  zone.value = lu.texte;
  // `readOnly` est une obligation vérifiée par l'hôte ; on fige le champ AVANT
  // que l'utilisateur ne tape vingt minutes pour rien.
  zone.readOnly = host.readOnly;

  racine.append(
    el('header', { classe: 'wc-barre' }, [
      el('span', { classe: 'wc-nom', texte: host.fileName }),
      stats,
      barre.statut,
    ]),
    barre.alerte,
    zone,
    el('footer', { classe: 'wc-pied' }, [detail])
  );

  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrireTexte(zone.value, lu.bom, lu.finDeLigne)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  const rafraichir = () => {
    const c = compter(zone.value);
    stats.textContent = t.stats(c.mots, c.caracteres, c.minutesLecture);
    detail.textContent = t.detail(c.caracteresSansEspaces);
  };

  ecoute.sur(zone, 'input', () => {
    rafraichir();
    sauvegarde.modifie();
  });
  ecoute.sur(racine, 'keydown', (e) => {
    if (!estRaccourciEnregistrer(e as KeyboardEvent)) return;
    e.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  rafraichir();

  return {
    destroy() {
      // Pas de « dernière sauvegarde » : le port se ferme juste après.
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    // Total, borné, synchrone : l'état courant, toujours.
    getBytes: () => ecrireTexte(zone.value, lu.bom, lu.finDeLigne),
  };
}

// L'id publié, plus des alias pour « Tester localement » : le manifeste
// synthétique du test local s'appelle `dev-local-<n>` (QUICKSTART.md §4).
const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
