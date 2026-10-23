/**
 * i18n — français si Filarr est en français, anglais sinon (`host.locale`), et
 * le message de chaque échec : refus de l'utilisateur, absence de relais (web),
 * jeton refusé, limite de GitHub…
 */

import type { TextesEtat } from './etat';
import type { Echec } from './github';

export type Langue = 'fr' | 'en';

export function langueDe(locale: string): Langue {
  return /^fr\b/i.test(locale) ? 'fr' : 'en';
}

export interface Textes extends TextesEtat {
  depot: string;
  ajouter: string;
  nomInvalide: string;
  dejaSuivi: string;
  liste: string;
  actualiser: string;
  toutActualiser: string;
  retirer: (nom: string) => string;
  etoiles: string;
  issues: string;
  version: string;
  aucuneVersion: string;
  jamaisReleve: string;
  releveLe: (quand: string) => string;
  publieeLe: (quand: string) => string;
  nouvelle: string;
  enCours: string;
  vide: string;
  jetonTitre: string;
  jetonTexte: string[];
  echecs: Record<Exclude<Echec['type'], 'reseau' | 'statut'>, string> & { statut: (n: number) => string; reseau: Record<string, string>; autre: (c: string) => string };
  illisible: string;
  versionInconnue: (v: number) => string;
  repare: string;
}

export const TEXTES: Record<Langue, Textes> = {
  fr: {
    depot: 'Dépôt GitHub (propriétaire/nom)',
    ajouter: 'Suivre',
    nomInvalide: 'Nom de dépôt invalide : attendu « propriétaire/nom », par exemple « yjs/yjs ».',
    dejaSuivi: 'Ce dépôt est déjà suivi.',
    liste: 'Dépôts suivis',
    actualiser: 'Actualiser',
    toutActualiser: 'Tout actualiser',
    retirer: (n) => `Ne plus suivre ${n}`,
    etoiles: 'étoiles',
    issues: 'tickets ouverts',
    version: 'dernière version',
    aucuneVersion: 'aucune version publiée',
    jamaisReleve: 'Jamais relevé : « Actualiser » pour interroger GitHub.',
    releveLe: (q) => `relevé le ${q}`,
    publieeLe: (q) => `publiée le ${q}`,
    nouvelle: 'Nouvelle version depuis le dernier relevé',
    enCours: 'Demande envoyée à Filarr…',
    vide: 'Aucun dépôt suivi. Saisissez « propriétaire/nom » pour commencer.',
    jetonTitre: 'Un jeton GitHub ? Facultatif.',
    jetonTexte: [
      'Sans jeton, GitHub limite à 60 requêtes par heure, et un relevé en coûte deux. Avec un jeton (lecture seule suffit), la limite monte à 5 000.',
      'Le jeton se saisit dans Filarr, jamais ici : Mes extensions › Dépôts GitHub › Secrets, sous la forme « Bearer ghp_… ».',
      "Filarr le garde dans le trousseau de cet appareil et l'ajoute lui-même à l'en-tête Authorization des requêtes vers api.github.com. Cette extension ne le voit jamais, et ne peut pas l'envoyer ailleurs.",
    ],
    echecs: {
      sans_reseau: "L'accès à Internet n'a pas été accordé à cette extension.",
      jeton: 'GitHub refuse le jeton (401). Vérifiez-le dans Mes extensions › Secrets, ou retirez-le.',
      limite: 'Limite de requêtes de GitHub atteinte. Réessayez plus tard, ou ajoutez un jeton.',
      introuvable: 'Dépôt introuvable — ou privé, et le jeton ne donne pas accès.',
      forme: 'Réponse de GitHub illisible.',
      statut: (n) => `GitHub a répondu par une erreur (${n}).`,
      reseau: {
        net_refused: 'Requête refusée. Rien n’a été envoyé.',
        unavailable: "Disponible seulement dans l'application de bureau : sur le web, une extension n'a pas accès à Internet.",
        net_unreachable: 'GitHub injoignable. Êtes-vous hors ligne ?',
        busy: 'Trop de demandes en attente de votre accord. Répondez-y, puis réessayez.',
        rate_limited: 'Trop de requêtes à la fois. Réessayez dans un instant.',
        too_many_requests: 'Trop de requêtes à la fois. Réessayez dans un instant.',
        net_redirect: 'GitHub a redirigé ailleurs : Filarr a refusé de suivre.',
      },
      autre: (c) => `La requête a échoué (${c}).`,
    },
    illisible: "Ce fichier n'est pas une liste de dépôts lisible. Il est laissé intact : rien ne sera enregistré.",
    versionInconnue: (v) => `Ce fichier a été écrit par une version plus récente de l'extension (format ${v}). Il est laissé intact.`,
    repare: 'Des dépôts mal formés ou en double ont été écartés ; ils disparaîtront au prochain enregistrement.',
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
    depot: 'GitHub repository (owner/name)',
    ajouter: 'Follow',
    nomInvalide: 'Invalid repository name: expected “owner/name”, for example “yjs/yjs”.',
    dejaSuivi: 'This repository is already followed.',
    liste: 'Followed repositories',
    actualiser: 'Refresh',
    toutActualiser: 'Refresh all',
    retirer: (n) => `Stop following ${n}`,
    etoiles: 'stars',
    issues: 'open issues',
    version: 'latest release',
    aucuneVersion: 'no release published',
    jamaisReleve: 'Never checked: use “Refresh” to ask GitHub.',
    releveLe: (q) => `checked on ${q}`,
    publieeLe: (q) => `published on ${q}`,
    nouvelle: 'New release since the last check',
    enCours: 'Request sent to Filarr…',
    vide: 'No repositories yet. Enter “owner/name” to start.',
    jetonTitre: 'A GitHub token? Optional.',
    jetonTexte: [
      'Without a token, GitHub allows 60 requests per hour, and a check costs two. With a token (read-only is enough), the limit goes up to 5,000.',
      'The token is entered in Filarr, never here: My extensions › GitHub repositories › Secrets, as “Bearer ghp_…”.',
      'Filarr keeps it in this device’s keychain and adds it itself to the Authorization header of requests to api.github.com. This extension never sees it, and cannot send it anywhere else.',
    ],
    echecs: {
      sans_reseau: 'Internet access was not granted to this extension.',
      jeton: 'GitHub rejects the token (401). Check it in My extensions › Secrets, or remove it.',
      limite: 'GitHub rate limit reached. Retry later, or add a token.',
      introuvable: 'Repository not found — or private, and the token does not grant access.',
      forme: 'Unreadable answer from GitHub.',
      statut: (n) => `GitHub answered with an error (${n}).`,
      reseau: {
        net_refused: 'Request declined. Nothing was sent.',
        unavailable: 'Only available in the desktop app: on the web, extensions have no Internet access.',
        net_unreachable: 'GitHub unreachable. Are you offline?',
        busy: 'Too many requests waiting for your approval. Answer them, then retry.',
        rate_limited: 'Too many requests at once. Retry in a moment.',
        too_many_requests: 'Too many requests at once. Retry in a moment.',
        net_redirect: 'GitHub redirected elsewhere: Filarr refused to follow.',
      },
      autre: (c) => `The request failed (${c}).`,
    },
    illisible: 'This file is not a readable list of repositories. It is left untouched: nothing will be saved.',
    versionInconnue: (v) => `This file was written by a newer version of the extension (format ${v}). It is left untouched.`,
    repare: 'Some malformed or duplicate repositories were dropped; they will be gone after the next save.',
    modifie: 'Modified',
    enregistrement: 'Saving…',
    enregistre: (h) => `Saved at ${h}`,
    lectureSeule: 'Read-only',
    conflit: 'Conflict: this file was saved elsewhere since you opened it. Press Ctrl+S to overwrite it on purpose, or reopen it.',
    refusLectureSeule: 'Read-only: your changes will not be saved.',
    erreur: (code) => `Saving failed (${code}). Your changes are kept.`,
  },
};

export function messageEchec(e: Echec, t: Textes): string {
  if (e.type === 'reseau') return t.echecs.reseau[e.code] ?? t.echecs.autre(e.code);
  if (e.type === 'statut') return t.echecs.statut(e.statut);
  return t.echecs[e.type];
}
