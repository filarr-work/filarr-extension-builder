/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`), et
 * le message de CHAQUE refus réseau : un refus n'est pas une panne.
 */

import type { Resultat } from './client';
import type { TextesEtat } from './etat';
import type { Ciel } from './openmeteo';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  villes: string;
  chercher: string;
  ajouter: string;
  ajouterCoordonnees: string;
  nom: string;
  latitude: string;
  longitude: string;
  coordonneesInvalides: string;
  voir: string;
  toutActualiser: string;
  supprimer: (nom: string) => string;
  reglage: string;
  aideReglage: string;
  vide: string;
  chargement: string;
  ciel: Record<Ciel, string>;
  mesure: (temp: string, ciel: string, vent: string | null, humidite: string | null) => string;
  majA: (heure: string) => string;
  reessayer: string;
  confidentialite: string;
  erreurs: {
    sans_reseau: string;
    net_refused: string;
    unavailable: string;
    net_unreachable: string;
    busy: string;
    limite: string;
    statut: (n: number) => string;
    forme: string;
    autre: (code: string) => string;
  };
  widgetVide: string;
  widgetInconnu: (texte: string) => string;
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    villes: 'Villes suivies',
    chercher: 'Chercher une ville',
    ajouter: 'Ajouter',
    ajouterCoordonnees: 'Ajouter ce lieu',
    nom: 'Nom du lieu',
    latitude: 'Latitude',
    longitude: 'Longitude',
    coordonneesInvalides: 'Coordonnées invalides : latitude de −90 à 90, longitude de −180 à 180.',
    voir: 'Voir la météo',
    toutActualiser: 'Tout actualiser',
    supprimer: (n) => `Retirer ${n}`,
    reglage: 'Réglage du widget',
    aideReglage: "Pour afficher cette ville sur l'accueil, ajoutez le bloc « Météo » et recopiez ce réglage dans ses options.",
    vide: 'Aucune ville. Cherchez-en une, ou saisissez des coordonnées.',
    chargement: 'Demande envoyée à Filarr…',
    ciel: {
      clair: 'ciel clair',
      voile: 'peu nuageux',
      couvert: 'couvert',
      brouillard: 'brouillard',
      bruine: 'bruine',
      pluie: 'pluie',
      neige: 'neige',
      averses: 'averses',
      orage: 'orage',
      inconnu: 'temps inconnu',
    },
    mesure: (t, c, v, h) => [`${t} °C, ${c}`, v && `vent ${v} km/h`, h && `humidité ${h} %`].filter(Boolean).join(' · '),
    majA: (h) => `mesure de ${h}`,
    reessayer: 'Réessayer',
    confidentialite:
      "Chaque requête vers api.open-meteo.com vous est montrée par Filarr avant de partir. Elle ne contient que des coordonnées arrondies — jamais vos fichiers.",
    erreurs: {
      sans_reseau: "L'accès à Internet n'a pas été accordé à cette extension.",
      net_refused: 'Requête refusée. Rien n’a été envoyé.',
      unavailable: "La météo n'est disponible que dans l'application de bureau : sur le web, une extension n'a pas accès à Internet.",
      net_unreachable: 'Service injoignable. Êtes-vous hors ligne ?',
      busy: 'Trop de demandes en attente de votre accord. Répondez-y, puis réessayez.',
      limite: 'Trop de requêtes à la fois. Réessayez dans un instant.',
      statut: (n) => `Le service météo a répondu par une erreur (${n}).`,
      forme: 'Réponse du service météo illisible.',
      autre: (c) => `La requête a échoué (${c}).`,
    },
    widgetVide: 'Réglez ce bloc : indiquez une ville (par exemple « Lyon ») ou des coordonnées dans ses options.',
    widgetInconnu: (t) => `« ${t} » : ville inconnue. Indiquez une ville de la liste ou des coordonnées (« 45.76, 4.84 »).`,
    illisible: "Ce fichier n'est pas une liste de villes lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Ce fichier a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des lieux mal formés ont été écartés ; ils disparaîtront au prochain enregistrement.',
    modifie: 'Modifié',
    enregistrement: 'Enregistrement…',
    enregistre: (h) => `Enregistré à ${h}`,
    lectureSeule: 'Lecture seule',
    conflit:
      "Conflit : ce fichier a été enregistré ailleurs depuis son ouverture. Appuyez sur Ctrl+S pour l'écraser délibérément, ou rouvrez-le.",
    refusLectureSeule: 'Lecture seule : vos modifications ne seront pas enregistrées.',
    erreur: (code) => `L'enregistrement a échoué (${code}). Vos modifications sont gardées.`,
  },
  en: {
    villes: 'Followed places',
    chercher: 'Search a city',
    ajouter: 'Add',
    ajouterCoordonnees: 'Add this place',
    nom: 'Place name',
    latitude: 'Latitude',
    longitude: 'Longitude',
    coordonneesInvalides: 'Invalid coordinates: latitude −90 to 90, longitude −180 to 180.',
    voir: 'Show weather',
    toutActualiser: 'Refresh all',
    supprimer: (n) => `Remove ${n}`,
    reglage: 'Widget setting',
    aideReglage: 'To show this place on your home page, add the “Weather” block and copy this setting into its options.',
    vide: 'No places yet. Search a city, or enter coordinates.',
    chargement: 'Request sent to Filarr…',
    ciel: {
      clair: 'clear sky',
      voile: 'partly cloudy',
      couvert: 'overcast',
      brouillard: 'fog',
      bruine: 'drizzle',
      pluie: 'rain',
      neige: 'snow',
      averses: 'showers',
      orage: 'thunderstorm',
      inconnu: 'unknown weather',
    },
    mesure: (t, c, v, h) => [`${t} °C, ${c}`, v && `wind ${v} km/h`, h && `humidity ${h}%`].filter(Boolean).join(' · '),
    majA: (h) => `measured at ${h}`,
    reessayer: 'Retry',
    confidentialite: 'Every request to api.open-meteo.com is shown to you by Filarr before it leaves. It only carries rounded coordinates — never your files.',
    erreurs: {
      sans_reseau: 'Internet access was not granted to this extension.',
      net_refused: 'Request declined. Nothing was sent.',
      unavailable: 'Weather is only available in the desktop app: on the web, extensions have no Internet access.',
      net_unreachable: 'Service unreachable. Are you offline?',
      busy: 'Too many requests waiting for your approval. Answer them, then retry.',
      limite: 'Too many requests at once. Retry in a moment.',
      statut: (n) => `The weather service answered with an error (${n}).`,
      forme: 'Unreadable answer from the weather service.',
      autre: (c) => `The request failed (${c}).`,
    },
    widgetVide: 'Set up this block: enter a city (for example “Lyon”) or coordinates in its options.',
    widgetInconnu: (t) => `“${t}”: unknown city. Enter a city from the list or coordinates (“45.76, 4.84”).`,
    illisible: 'This file is not a readable list of places. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This file was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed places were dropped; they will be gone after the next save.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit: 'Conflict: this file was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};

/** Le message d'un échec, refus de l'utilisateur compris. */
export function messageEchec(r: Exclude<Resultat, { ok: true }>, t: Textes): string {
  if (r.type === 'sans_reseau') return t.erreurs.sans_reseau;
  if (r.type === 'statut') return t.erreurs.statut(r.statut);
  if (r.type === 'forme') return t.erreurs.forme;
  switch (r.code) {
    case 'net_refused':
      return t.erreurs.net_refused;
    case 'unavailable':
      return t.erreurs.unavailable;
    case 'net_unreachable':
      return t.erreurs.net_unreachable;
    case 'busy':
      return t.erreurs.busy;
    case 'rate_limited':
    case 'too_many_requests':
      return t.erreurs.limite;
    default:
      return t.erreurs.autre(r.code);
  }
}
