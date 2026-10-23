/**
 * widget — la météo sur l'ACCUEIL de Filarr (capacité `homeWidget`).
 *
 * La page est montée en mode `widget`, TOUJOURS en lecture seule : un bloc
 * d'accueil ne réécrit jamais la disposition. Sa seule donnée est le réglage
 * que l'utilisateur a saisi dans les options du bloc (240 caractères au plus),
 * reçu en UTF-8 comme `host.initialBytes` — ici, une ville ou des coordonnées.
 * Le widget ne lit PAS le fichier `.meteo` : il ne reçoit rien d'autre.
 *
 * Il demande la météo au montage, puis toutes les trente minutes. L'adresse
 * est identique d'une fois sur l'autre : Filarr ne redemande pas l'accord pour
 * une requête déjà acceptée pendant la session. Un refus, l'absence de réseau
 * (web : `unavailable`) ou une panne s'affichent, avec « Réessayer ».
 */

import { demanderMeteo } from './client';
import { el, feuille } from './dom';
import { TEXTES, langueDe, messageEchec } from './i18n';
import { lireReglage } from './meteo';
import { PICTOS, cielDe } from './openmeteo';
import { texteMesure } from './rendu';
import { CSS } from './style';

export const ACTUALISATION_MS = 30 * 60 * 1000;

export function monterWidget(host: FilarrHost): FilarrMountedInstance {
  const langue = langueDe(host.locale);
  const t = TEXTES[langue];
  host.container.textContent = '';
  const style = feuille(CSS);
  const racine = el('div', { classe: 'mtw', attrs: { lang: langue, 'data-schema': host.theme.scheme } });
  host.container.append(style, racine);
  const desabonnerTheme = host.onThemeChange((theme) => {
    racine.dataset.schema = theme.scheme;
  });

  const reglage = lireReglage(host.initialBytes);
  let minuterie: ReturnType<typeof setInterval> | null = null;
  let detruit = false;

  const lieu = el('p', { classe: 'mtw-lieu' });
  const picto = el('span', { classe: 'mtw-picto', attrs: { 'aria-hidden': 'true' } });
  const temperature = el('span', { classe: 'mtw-temp' });
  const detail = el('p', { classe: 'mtw-detail', attrs: { role: 'status' } });
  const echec = el('p', { classe: 'mtw-echec', attrs: { role: 'alert' } });
  const reessayer = el('button', { classe: 'mt-bouton', texte: t.reessayer, attrs: { type: 'button', 'data-action': 'reessayer' } });
  echec.hidden = true;
  reessayer.hidden = true;
  racine.append(lieu, el('p', { classe: 'mtw-ligne' }, [picto, temperature]), detail, echec, reessayer);

  if (!reglage.ok) {
    const brut = new TextDecoder().decode(host.initialBytes).trim().slice(0, 60);
    detail.textContent = reglage.raison === 'vide' ? t.widgetVide : t.widgetInconnu(brut);
  } else {
    lieu.textContent = reglage.nom;
    const actualiser = async () => {
      reessayer.disabled = true;
      const r = await demanderMeteo(host, reglage.lat, reglage.lon);
      if (detruit) return;
      reessayer.disabled = false;
      if (r.ok) {
        const ciel = cielDe(r.meteo.code);
        picto.textContent = PICTOS[ciel];
        temperature.textContent = `${Math.round(r.meteo.temperature)} °C`;
        detail.textContent = texteMesure(r.meteo, t, langue);
        echec.hidden = reessayer.hidden = true;
        echec.textContent = '';
      } else {
        echec.textContent = messageEchec(r, t);
        echec.hidden = false;
        // Un refus de l'utilisateur ou l'absence de relais ne se répare pas en
        // insistant : on n'actualise plus tout seul, on attend « Réessayer ».
        if (r.type === 'reseau' && (r.code === 'net_refused' || r.code === 'unavailable') && minuterie !== null) {
          clearInterval(minuterie);
          minuterie = null;
        }
        reessayer.hidden = r.type === 'sans_reseau';
      }
    };
    reessayer.addEventListener('click', () => void actualiser());
    void actualiser();
    minuterie = setInterval(() => void actualiser(), ACTUALISATION_MS);
  }

  return {
    destroy() {
      detruit = true;
      if (minuterie !== null) clearInterval(minuterie);
      desabonnerTheme();
      racine.remove();
      style.remove();
    },
  };
}
