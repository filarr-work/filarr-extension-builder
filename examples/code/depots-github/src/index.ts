/**
 * Dépôts GitHub — la capacité `network` vers `api.github.com`, avec un SECRET
 * déclaré (`network.secrets`), facultatif.
 *
 * Ce que l'exemple montre : une extension qui s'authentifie auprès d'un
 * service SANS jamais voir sa clé. Le jeton est saisi dans Filarr, scellé au
 * trousseau de l'appareil, et ajouté par le relais de Filarr à l'en-tête
 * déclaré (`authorization`) des seules requêtes vers `api.github.com`. Voir
 * `github.ts` pour le détail, et le README pour l'expliquer à l'utilisateur.
 *
 * Le fichier `.github` garde la liste des dépôts et leur dernier relevé ; un
 * relevé ne s'écrit que sur un geste, jamais à l'ouverture ni en lecture seule.
 */

import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { ecrireDepots, lireDepots, nomDepot, nouvelleVersion, type Depot } from './depots';
import { creerBarreEtat } from './etat';
import { releverDepot } from './github';
import { TEXTES, langueDe, messageEchec } from './i18n';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';

export const EDITOR_ID = 'depots-github-editor';

function mount(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'gh', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireDepots(host.initialBytes);
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

  let depots: Depot[] = lu.depots;
  let detruit = false;
  /** Ce qu'on a relevé en lecture seule : montré, jamais écrit. */
  const vus = new Map<string, Depot['releve']>();
  const nouveautes = new Set<string>();
  const messages = new Map<string, { texte: string; echec: boolean }>();
  const enCours = new Set<string>();

  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrireDepots(depots)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  const champ = el('input', { classe: 'gh-champ', attrs: { type: 'text', 'aria-label': t.depot, placeholder: 'yjs/yjs', spellcheck: 'false', autocomplete: 'off' } });
  const suivre = el('button', { classe: 'gh-bouton gh-principal', texte: t.ajouter, attrs: { type: 'button', 'data-action': 'suivre' } });
  const remarque = el('p', { classe: 'gh-remarque', attrs: { role: 'status' } });
  champ.readOnly = host.readOnly;
  suivre.disabled = host.readOnly;
  const tout = el('button', { classe: 'gh-bouton', texte: t.toutActualiser, attrs: { type: 'button', 'data-action': 'tout' } });
  const liste = el('ul', { classe: 'gh-liste', attrs: { 'aria-label': t.liste } });
  const vide = el('p', { classe: 'gh-vide', texte: t.vide });
  const jeton = el('details', { classe: 'gh-jeton' }, [el('summary', { texte: t.jetonTitre }), ...t.jetonTexte.map((p) => el('p', { texte: p }))]);

  racine.append(el('div', { classe: 'gh-outils' }, [champ, suivre, tout, barre.statut]), barre.alerte);
  if (lu.repare) racine.append(el('p', { classe: 'gh-info', texte: t.repare }));
  racine.append(el('div', { classe: 'gh-zone' }, [remarque, vide, liste, jeton]));

  const muter = (suivants: Depot[]) => {
    if (host.readOnly) return;
    depots = suivants;
    sauvegarde.modifie();
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString(langue, { dateStyle: 'medium' } as Intl.DateTimeFormatOptions);
  const nombre = (n: number) => n.toLocaleString(langue);

  function dessiner(): void {
    liste.textContent = '';
    vide.hidden = depots.length > 0;
    tout.disabled = depots.length === 0 || enCours.size > 0;
    for (const d of depots) {
      const releve = vus.get(d.nom) ?? d.releve;
      const actualiser = el('button', { classe: 'gh-bouton', texte: t.actualiser, attrs: { type: 'button', 'data-action': 'actualiser' } });
      actualiser.disabled = enCours.has(d.nom);
      actualiser.addEventListener('click', () => void relever(d.nom).then(dessiner));
      const retirer = el('button', { classe: 'gh-bouton', texte: '×', attrs: { type: 'button', 'aria-label': t.retirer(d.nom), 'data-action': 'retirer' } });
      retirer.disabled = host.readOnly;
      retirer.addEventListener('click', () => {
        muter(depots.filter((x) => x.nom !== d.nom));
        dessiner();
        champ.focus();
      });
      const chiffres = releve
        ? el('dl', { classe: 'gh-chiffres' }, [
            el('div', {}, [el('dt', { texte: t.etoiles }), el('dd', { texte: nombre(releve.etoiles) })]),
            el('div', {}, [el('dt', { texte: t.issues }), el('dd', { texte: nombre(releve.issues) })]),
            el('div', {}, [
              el('dt', { texte: t.version }),
              el('dd', { texte: releve.version ?? t.aucuneVersion }),
            ]),
          ])
        : el('p', { classe: 'gh-note', texte: t.jamaisReleve });
      const message = messages.get(d.nom);
      const details = releve
        ? [releve.publiee && t.publieeLe(date(releve.publiee)), t.releveLe(date(releve.le))].filter(Boolean).join(' · ')
        : '';
      liste.append(
        el('li', { classe: 'gh-depot' }, [
          el('div', { classe: 'gh-ligne' }, [el('strong', { classe: 'gh-nom', texte: d.nom }), actualiser, retirer]),
          nouveautes.has(d.nom) ? el('p', { classe: 'gh-nouvelle', texte: t.nouvelle }) : null,
          chiffres,
          details ? el('p', { classe: 'gh-note', texte: details }) : null,
          el('p', { classe: message?.echec ? 'gh-echec' : 'gh-note', texte: message?.texte ?? '', attrs: { role: 'status' } }),
        ])
      );
    }
  }

  async function relever(nom: string): Promise<void> {
    if (enCours.has(nom)) return;
    enCours.add(nom);
    messages.set(nom, { texte: t.enCours, echec: false });
    dessiner();
    const r = await releverDepot(host, nom);
    if (detruit) return;
    enCours.delete(nom);
    if (!r.ok) {
      messages.set(nom, { texte: messageEchec(r.echec, t), echec: true });
      return;
    }
    messages.delete(nom);
    const avant = vus.get(nom) ?? depots.find((d) => d.nom === nom)?.releve ?? null;
    if (nouvelleVersion(avant, r.releve)) nouveautes.add(nom);
    if (host.readOnly) vus.set(nom, r.releve);
    else muter(depots.map((d) => (d.nom === nom ? { ...d, releve: r.releve } : d)));
  }

  ecoute.sur(suivre, 'click', () => {
    const nom = nomDepot(champ.value);
    if (!nom) {
      remarque.textContent = t.nomInvalide;
      return;
    }
    if (depots.some((d) => d.nom.toLowerCase() === nom.toLowerCase())) {
      remarque.textContent = t.dejaSuivi;
      return;
    }
    remarque.textContent = '';
    champ.value = '';
    muter([...depots, { nom, releve: null }]);
    dessiner();
  });
  ecoute.sur(champ, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') suivre.click();
  });
  // Les dépôts l'un après l'autre : chaque requête est montrée à l'utilisateur,
  // et Filarr ne garde que quatre demandes en attente (au-delà : `busy`).
  ecoute.sur(tout, 'click', async () => {
    for (const d of [...depots]) {
      if (detruit) return;
      await relever(d.nom);
    }
    if (!detruit) dessiner();
  });
  ecoute.sur(racine, 'keydown', (e) => {
    if (!estRaccourciEnregistrer(e as KeyboardEvent)) return;
    e.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  dessiner();

  return {
    destroy() {
      detruit = true;
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: () => ecrireDepots(depots),
  };
}

const ids = [EDITOR_ID];
for (let i = 1; i <= 8; i++) ids.push(`dev-local-${i}-editor`);

globalThis.filarrSandboxedPlugin = { editors: ids.map((id) => ({ id, mount })) };
