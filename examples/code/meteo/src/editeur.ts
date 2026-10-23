/**
 * editeur — la liste des villes suivies (le fichier `.meteo`).
 *
 * Ajouter ou retirer une ville modifie le FICHIER (autosave, lecture seule
 * respectée). Consulter la météo n'en modifie rien : le bouton « Voir la
 * météo » reste actif en lecture seule, et la mesure n'est jamais écrite dans
 * le document. Rien ne part sans un geste : aucune requête n'est lancée à
 * l'ouverture du fichier.
 */

import { demanderMeteo } from './client';
import { creerEcouteurs, el, estRaccourciEnregistrer, feuille } from './dom';
import { creerBarreEtat } from './etat';
import { TEXTES, langueDe, messageEchec } from './i18n';
import { NOM_MAX, coordonneesValides, ecrireMeteo, lireMeteo, nouvelId, reglagePour, type Lieu } from './meteo';
import { texteMesure } from './rendu';
import { creerSauvegarde } from './sauvegarde';
import { CSS } from './style';
import { chercherVilles } from './villes';

export function monterEditeur(host: FilarrHost): FilarrEditorInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  const ecoute = creerEcouteurs();
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'mt', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const lu = lireMeteo(host.initialBytes);
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

  let lieux: Lieu[] = lu.lieux;
  let detruit = false;
  const barre = creerBarreEtat(t, langue, host.readOnly);
  const sauvegarde = creerSauvegarde({
    lectureSeule: host.readOnly,
    enregistrer: () => host.saveBytes(ecrireMeteo(lieux)),
    signalerSale: (sale) => host.onDirty(sale),
    surEtat: barre.afficher,
  });

  // ── Ajouter : depuis le répertoire embarqué, ou par coordonnées ──
  const recherche = el('input', { classe: 'mt-champ', attrs: { type: 'search', 'aria-label': t.chercher, placeholder: t.chercher, autocomplete: 'off' } });
  const resultats = el('ul', { classe: 'mt-resultats', attrs: { 'aria-label': t.chercher } });
  const nom = el('input', { classe: 'mt-champ mt-nom', attrs: { type: 'text', 'aria-label': t.nom, placeholder: t.nom, maxlength: NOM_MAX } });
  const lat = el('input', { classe: 'mt-champ mt-coord', attrs: { type: 'number', step: 'any', min: -90, max: 90, 'aria-label': t.latitude, placeholder: t.latitude } });
  const lon = el('input', { classe: 'mt-champ mt-coord', attrs: { type: 'number', step: 'any', min: -180, max: 180, 'aria-label': t.longitude, placeholder: t.longitude } });
  const ajouterCoord = el('button', { classe: 'mt-bouton', texte: t.ajouterCoordonnees, attrs: { type: 'button', 'data-action': 'ajouter-coordonnees' } });
  const coordInvalides = el('p', { classe: 'mt-note', attrs: { role: 'status' } });
  for (const c of [recherche, nom, lat, lon]) c.readOnly = host.readOnly;
  ajouterCoord.disabled = host.readOnly;

  const liste = el('ul', { classe: 'mt-liste', attrs: { 'aria-label': t.villes } });
  const vide = el('p', { classe: 'mt-vide', texte: t.vide });
  const toutActualiser = el('button', { classe: 'mt-bouton', texte: t.toutActualiser, attrs: { type: 'button', 'data-action': 'tout' } });

  racine.append(el('div', { classe: 'mt-outils' }, [toutActualiser, barre.statut]), barre.alerte);
  if (lu.repare) racine.append(el('p', { classe: 'mt-info', texte: t.repare }));
  racine.append(
    el('div', { classe: 'mt-zone' }, [
      el('section', { classe: 'mt-ajout' }, [
        el('div', { classe: 'mt-ligne' }, [recherche]),
        resultats,
        el('div', { classe: 'mt-ligne' }, [nom, lat, lon, ajouterCoord]),
        coordInvalides,
      ]),
      vide,
      liste,
      el('p', { classe: 'mt-note', texte: t.confidentialite }),
    ])
  );

  const muter = (suivants: Lieu[]) => {
    if (host.readOnly) return;
    lieux = suivants;
    dessiner();
    sauvegarde.modifie();
  };
  const ajouter = (n: string, la: number, lo: number) => {
    muter([...lieux, { id: nouvelId(new Set(lieux.map((l) => l.id))), nom: n.slice(0, NOM_MAX), lat: la, lon: lo }]);
  };

  ecoute.sur(recherche, 'input', () => {
    resultats.textContent = '';
    if (host.readOnly) return;
    for (const v of chercherVilles(recherche.value)) {
      const b = el('button', { classe: 'mt-resultat', texte: `${v.nom} (${v.pays})`, attrs: { type: 'button', 'data-action': 'choisir' } });
      b.addEventListener('click', () => {
        ajouter(v.nom, v.lat, v.lon);
        recherche.value = '';
        resultats.textContent = '';
        recherche.focus();
      });
      resultats.append(el('li', {}, [b]));
    }
  });
  ecoute.sur(ajouterCoord, 'click', () => {
    const la = Number(lat.value);
    const lo = Number(lon.value);
    if (lat.value === '' || lon.value === '' || !coordonneesValides(la, lo)) {
      coordInvalides.textContent = t.coordonneesInvalides;
      return;
    }
    coordInvalides.textContent = '';
    ajouter(nom.value.trim() || `${la}, ${lo}`, la, lo);
    nom.value = lat.value = lon.value = '';
  });

  // ── La liste, et la météo à la demande ──
  const voirs = new Map<string, () => Promise<void>>();

  function dessiner(): void {
    liste.textContent = '';
    voirs.clear();
    vide.hidden = lieux.length > 0;
    toutActualiser.disabled = lieux.length === 0;
    for (const l of lieux) {
      const mesure = el('p', { classe: 'mt-mesure', attrs: { role: 'status' } });
      const voir = el('button', { classe: 'mt-bouton', texte: t.voir, attrs: { type: 'button', 'data-action': 'voir' } });
      const retirer = el('button', { classe: 'mt-bouton', texte: '×', attrs: { type: 'button', 'aria-label': t.supprimer(l.nom), 'data-action': 'retirer' } });
      retirer.disabled = host.readOnly;
      // Le réglage à recopier : un champ en lecture seule, que l'on sélectionne et copie.
      const reglage = el('input', { classe: 'mt-champ mt-reglage', attrs: { type: 'text', 'aria-label': t.reglage, title: t.aideReglage, 'data-lecture': true } });
      reglage.value = reglagePour(l);
      reglage.readOnly = true;
      reglage.addEventListener('focus', () => reglage.select());
      const consulter = async () => {
        voir.disabled = true;
        mesure.textContent = t.chargement;
        const r = await demanderMeteo(host, l.lat, l.lon);
        if (detruit) return;
        voir.disabled = false;
        mesure.textContent = r.ok ? texteMesure(r.meteo, t, langue) : messageEchec(r, t);
        mesure.classList.toggle('mt-echec', !r.ok);
      };
      voirs.set(l.id, consulter);
      voir.addEventListener('click', () => void consulter());
      retirer.addEventListener('click', () => muter(lieux.filter((x) => x.id !== l.id)));
      liste.append(
        el('li', { classe: 'mt-lieu' }, [
          el('div', { classe: 'mt-ligne' }, [
            el('strong', { texte: l.nom }),
            el('span', { classe: 'mt-coords', texte: `${l.lat.toLocaleString(langue)}, ${l.lon.toLocaleString(langue)}` }),
            voir,
            retirer,
          ]),
          mesure,
          el('label', { classe: 'mt-ligne mt-reglage-ligne' }, [el('span', { texte: t.reglage }), reglage]),
        ])
      );
    }
  }

  // Une demande à la fois : Filarr montre chaque requête, et au-delà de quatre
  // en attente il rend `busy`. On les enchaîne plutôt que de les empiler.
  ecoute.sur(toutActualiser, 'click', async () => {
    toutActualiser.disabled = true;
    for (const consulter of [...voirs.values()]) {
      if (detruit) return;
      await consulter();
    }
    if (!detruit) toutActualiser.disabled = lieux.length === 0;
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
    getBytes: () => ecrireMeteo(lieux),
  };
}
