/**
 * editeur — l'éditeur du fichier `.rebours` : une liste d'évènements datés,
 * chacun avec son compte à rebours qui avance à la seconde.
 *
 * La liste est tenue dans l'ORDRE DU TEMPS : changer une date déplace la carte
 * à sa place, et le focus la suit. Le titre et la note se modifient sans rien
 * redessiner.
 */

import { demarrerHorloge, texteCompte } from './affichage';
import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import {
  NOTE_MAX,
  TITRE_MAX,
  chronologique,
  demainNeufHeures,
  depuisChampLocal,
  ecrireRebours,
  lireRebours,
  nouvelId,
  prochain,
  versChampLocal,
  type Evenement,
} from './rebours';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';

interface Carte {
  li: HTMLLIElement;
  compte: HTMLTimeElement;
  titre: HTMLInputElement;
  date: HTMLInputElement;
}

export function monterEditeur(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'cr', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireRebours(host.initialBytes);
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

  let evenements = lu.evenements;
  let dernier: string | null = null;
  const cartes = new Map<string, Carte>();
  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrireRebours(evenements)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  const ajouter = el('button', { classe: 'cr-bouton cr-principal', texte: t.ajouter, attrs: { type: 'button', 'data-action': 'ajouter' } });
  ajouter.disabled = host.readOnly;
  const liste = el('ul', { classe: 'cr-liste', attrs: { 'aria-label': t.liste } });
  const vide = el('p', { classe: 'cr-vide', texte: t.vide });
  const annonce = el('div', { classe: 'cr-cache', attrs: { 'aria-live': 'polite' } });
  racine.append(el('div', { classe: 'cr-outils' }, [ajouter, barre.statut]), barre.alerte);
  if (lu.repare) racine.append(el('p', { classe: 'cr-info', texte: t.repare }));
  racine.append(el('div', { classe: 'cr-zone' }, [vide, liste]), annonce);

  const muter = (suivants: Evenement[], redessiner: boolean) => {
    if (host.readOnly) return;
    evenements = suivants;
    if (redessiner) dessiner();
    sauvegarde.modifie();
  };

  function creerCarte(e: Evenement): Carte {
    const titre = el('input', { classe: 'cr-titre', attrs: { type: 'text', 'aria-label': t.titre, placeholder: t.sansTitre, maxlength: TITRE_MAX } });
    titre.value = e.titre;
    titre.readOnly = host.readOnly;
    const date = el('input', { classe: 'cr-date', attrs: { type: 'datetime-local', 'aria-label': t.date } });
    date.value = versChampLocal(e.date);
    date.readOnly = host.readOnly;
    const note = el('textarea', { classe: 'cr-note', attrs: { rows: 2, 'aria-label': t.note, maxlength: NOTE_MAX } });
    note.value = e.note;
    note.readOnly = host.readOnly;
    const compte = el('time', { classe: 'cr-compte', attrs: { datetime: e.date } });
    const supprimer = el('button', { classe: 'cr-supprimer', texte: '×', attrs: { type: 'button', 'data-action': 'supprimer', 'aria-label': t.supprimer(e.titre || t.sansTitre) } });
    supprimer.disabled = host.readOnly;

    const id = e.id;
    titre.addEventListener('input', () => {
      muter(evenements.map((x) => (x.id === id ? { ...x, titre: titre.value.slice(0, TITRE_MAX) } : x)), false);
      supprimer.setAttribute('aria-label', t.supprimer(titre.value || t.sansTitre));
    });
    note.addEventListener('input', () => muter(evenements.map((x) => (x.id === id ? { ...x, note: note.value.slice(0, NOTE_MAX) } : x)), false));
    // À la VALIDATION du champ (`change`) : une date en cours de saisie n'est pas une date.
    date.addEventListener('change', () => {
      const iso = depuisChampLocal(date.value);
      if (!iso) return;
      muter(chronologique(evenements.map((x) => (x.id === id ? { ...x, date: iso } : x))), true);
      cartes.get(id)?.date.focus();
    });
    supprimer.addEventListener('click', () => {
      const i = evenements.findIndex((x) => x.id === id);
      muter(evenements.filter((x) => x.id !== id), true);
      annonce.textContent = t.supprime;
      const voisin = evenements[Math.min(i, evenements.length - 1)];
      if (voisin) cartes.get(voisin.id)?.titre.focus();
      else ajouter.focus();
    });

    const li = el('li', { classe: 'cr-carte', attrs: { 'data-id': id } }, [
      el('div', { classe: 'cr-ligne' }, [titre, supprimer]),
      el('div', { classe: 'cr-ligne' }, [date, compte]),
      note,
    ]);
    return { li, compte, titre, date };
  }

  function dessiner(): void {
    const actif = document.activeElement;
    const ids = new Set(evenements.map((e) => e.id));
    for (const [id, c] of cartes) {
      if (!ids.has(id)) {
        c.li.remove();
        cartes.delete(id);
      }
    }
    evenements.forEach((e, i) => {
      let c = cartes.get(e.id);
      if (!c) {
        c = creerCarte(e);
        cartes.set(e.id, c);
      }
      c.compte.setAttribute('datetime', e.date);
      c.li.toggleAttribute('data-dernier', e.id === dernier);
      if (liste.children[i] !== c.li) liste.insertBefore(c.li, liste.children[i] ?? null);
    });
    vide.hidden = evenements.length > 0;
    if (actif instanceof HTMLElement && actif.isConnected && document.activeElement !== actif) actif.focus();
    tic(Date.now());
  }

  function tic(maintenant: number): void {
    const suivant = prochain(evenements, maintenant);
    for (const e of evenements) {
      const c = cartes.get(e.id);
      if (!c) continue;
      c.compte.textContent = texteCompte(e.date, maintenant, t, langue);
      c.li.classList.toggle('cr-passe', Date.parse(e.date) <= maintenant);
      c.li.classList.toggle('cr-prochain', e === suivant);
    }
  }

  ecoute.sur(ajouter, 'click', () => {
    const e: Evenement = { id: nouvelId(new Set(evenements.map((x) => x.id))), titre: '', date: demainNeufHeures(Date.now()), note: '' };
    dernier = e.id;
    muter(chronologique([...evenements, e]), true);
    cartes.get(e.id)?.titre.focus();
    annonce.textContent = t.ajoute;
  });
  ecoute.sur(racine, 'keydown', (ev) => {
    if (!estRaccourciEnregistrer(ev as KeyboardEvent)) return;
    ev.preventDefault();
    if (!host.readOnly) sauvegarde.maintenant();
  });

  dessiner();
  const horloge = demarrerHorloge(tic);

  return {
    destroy() {
      horloge.arreter();
      sauvegarde.detruire();
      desabonnerTheme();
      ecoute.tout();
      racine.remove();
      style.remove();
    },
    getBytes: () => ecrireRebours(evenements),
  };
}
