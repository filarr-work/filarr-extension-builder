/**
 * bloc — le compte à rebours DANS UNE NOTE (capacité `noteBlock`).
 *
 * La page est montée en mode `block` (`host.mode === 'block'`) dans le cadre du
 * bloc. Elle ne reçoit que SES données (`initialBytes`), jamais le reste de la
 * note ; « enregistrer » (`saveBytes`) les réécrit dans le nœud du bloc — c'est
 * la note qui les chiffre et les synchronise, comme tout son contenu. Elles
 * doivent rester petites : 256 Kio au plus.
 *
 * Mêmes règles que l'éditeur : 0 octet = bloc neuf, lecture seule respectée
 * (une note en lecture seule, ou un lecteur du coffre), enregistrement
 * débouncé à 2 s, codes de rejet affichés, `destroy()` qui rend tout. L'hôte
 * ne demande jamais `getBytes()` à un bloc ; on la fournit quand même.
 *
 * Des données illisibles ne sont PAS réécrites d'office : le bloc le dit, et
 * ne les remplace que si l'utilisateur le règle.
 */

import { dateLisible, demarrerHorloge, texteCompte } from './affichage';
import { el, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe } from './i18n';
import { BLOC_MAX_OCTETS, TITRE_MAX, depuisChampLocal, ecrireBloc, lireBloc, versChampLocal, type DonneesBloc } from './rebours';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';

export function monterBloc(host: FilarrHost): FilarrMountedInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'crb', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireBloc(host.initialBytes);
  let donnees: DonneesBloc = lu.donnees;
  const original = host.initialBytes.slice();
  let touche = false;

  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => {
      const octets = ecrireBloc(donnees);
      if (octets.byteLength > BLOC_MAX_OCTETS) return Promise.reject(new Error('too_large'));
      return host.saveBytes(octets);
    },
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  const titre = el('p', { classe: 'crb-nom' });
  const compte = el('p', { classe: 'crb-compte' });
  const quand = el('time', { classe: 'crb-quand' });
  const vue = el('div', { classe: 'crb-vue' }, [titre, compte, quand]);

  const champTitre = el('input', { classe: 'crb-titre', attrs: { type: 'text', 'aria-label': t.titre, placeholder: t.blocTitre, maxlength: TITRE_MAX } });
  champTitre.value = donnees.titre;
  const champDate = el('input', { classe: 'crb-date', attrs: { type: 'datetime-local', 'aria-label': t.date } });
  champDate.value = versChampLocal(donnees.date);
  champTitre.readOnly = host.readOnly;
  champDate.readOnly = host.readOnly;
  const formulaire = el('div', { classe: 'crb-formulaire', attrs: { id: 'crb-formulaire' } }, [champTitre, champDate]);
  const regler = el('button', {
    classe: 'crb-regler',
    texte: t.regler,
    attrs: { type: 'button', 'data-action': 'regler', 'aria-expanded': 'false', 'aria-controls': 'crb-formulaire' },
  });

  // En lecture seule, ni bouton ni formulaire : il n'y a rien à régler.
  const editable = !host.readOnly;
  formulaire.hidden = !(editable && !donnees.date);
  regler.hidden = !editable;
  regler.setAttribute('aria-expanded', String(!formulaire.hidden));
  racine.append(vue, el('div', { classe: 'crb-barre' }, [regler, barre.statut]), formulaire, barre.alerte);
  if (!lu.lisible) racine.append(el('p', { classe: 'crb-info', texte: t.blocIllisible }));

  const changer = (d: DonneesBloc) => {
    if (host.readOnly) return;
    donnees = d;
    touche = true;
    tic(Date.now());
    sauvegarde.modifie();
  };
  regler.addEventListener('click', () => {
    formulaire.hidden = !formulaire.hidden;
    regler.textContent = formulaire.hidden ? t.regler : t.fermer;
    regler.setAttribute('aria-expanded', String(!formulaire.hidden));
    if (!formulaire.hidden) champTitre.focus();
  });
  champTitre.addEventListener('input', () => changer({ ...donnees, titre: champTitre.value.slice(0, TITRE_MAX) }));
  champDate.addEventListener('change', () => {
    const iso = depuisChampLocal(champDate.value);
    if (iso) changer({ ...donnees, date: iso });
  });
  racine.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !formulaire.hidden && editable) {
      formulaire.hidden = true;
      regler.textContent = t.regler;
      regler.setAttribute('aria-expanded', 'false');
      regler.focus();
    }
  });

  function tic(maintenant: number): void {
    titre.textContent = donnees.titre || t.blocTitre;
    if (!donnees.date) {
      compte.textContent = t.pasRegle;
      quand.textContent = '';
      quand.removeAttribute('datetime');
      return;
    }
    compte.textContent = texteCompte(donnees.date, maintenant, t, langue);
    quand.textContent = dateLisible(donnees.date, langue);
    quand.setAttribute('datetime', donnees.date);
  }
  const horloge = demarrerHorloge(tic);

  return {
    destroy() {
      horloge.arreter();
      sauvegarde.detruire();
      desabonnerTheme();
      racine.remove();
      style.remove();
    },
    // Tant que l'utilisateur n'a rien réglé, les octets d'origine, à l'identique.
    getBytes: () => (touche ? ecrireBloc(donnees) : original.slice()),
  };
}
