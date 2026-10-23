/**
 * openmeteo — parler à `api.open-meteo.com`, et rien qu'à lui. Pur : l'adresse
 * d'une requête, la lecture d'une réponse, le sens des codes météo.
 *
 * L'ADRESSE EST STABLE. Filarr montre chaque requête à l'utilisateur avant de
 * l'envoyer ; une requête IDENTIQUE déjà acceptée pendant la session passe sans
 * redemander. Les coordonnées sont donc arrondies (4 décimales, ~11 m) et les
 * paramètres toujours dans le même ordre : le widget qui s'actualise toutes les
 * trente minutes ne redemande rien, et l'adresse n'en dit pas plus que la ville.
 *
 * LA RÉPONSE EST HOSTILE. Elle vient d'Internet : on n'en garde que des nombres
 * vérifiés, et un statut autre que 200 est une réponse (un 404 n'est pas un
 * rejet), pas une erreur réseau.
 */

export const DOMAINE = 'api.open-meteo.com';

export interface Meteo {
  temperature: number;
  humidite: number | null;
  vent: number | null;
  code: number;
  /** L'heure locale de la mesure, telle que le service la donne (`2026-10-23T14:45`). */
  heure: string | null;
}

export type LectureMeteo = { ok: true; meteo: Meteo } | { ok: false; raison: 'statut'; statut: number } | { ok: false; raison: 'forme' };

const arrondir = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);

export function urlPrevision(lat: number, lon: number): string {
  return (
    `https://${DOMAINE}/v1/forecast?latitude=${arrondir(lat)}&longitude=${arrondir(lon)}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto'
  );
}

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function lireReponse(statut: number, octets: Uint8Array): LectureMeteo {
  if (statut !== 200) return { ok: false, raison: 'statut', statut };
  try {
    const b = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets)) as { current?: Record<string, unknown> };
    const c = b.current;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'forme' };
    const temperature = nombre(c.temperature_2m);
    const code = nombre(c.weather_code);
    if (temperature === null || code === null) return { ok: false, raison: 'forme' };
    return {
      ok: true,
      meteo: {
        temperature,
        humidite: nombre(c.relative_humidity_2m),
        vent: nombre(c.wind_speed_10m),
        code: Math.round(code),
        heure: typeof c.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time) ? c.time : null,
      },
    };
  } catch {
    return { ok: false, raison: 'forme' };
  }
}

/** Les codes météo de l'OMM (WMO 4677, tels qu'Open-Meteo les rend), regroupés. */
export type Ciel = 'clair' | 'voile' | 'couvert' | 'brouillard' | 'bruine' | 'pluie' | 'neige' | 'averses' | 'orage' | 'inconnu';

export function cielDe(code: number): Ciel {
  if (code === 0) return 'clair';
  if (code === 1 || code === 2) return 'voile';
  if (code === 3) return 'couvert';
  if (code === 45 || code === 48) return 'brouillard';
  if (code >= 51 && code <= 57) return 'bruine';
  if ((code >= 61 && code <= 67) || code === 80 || code === 81 || code === 82) return code >= 80 ? 'averses' : 'pluie';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neige';
  if (code >= 95 && code <= 99) return 'orage';
  return 'inconnu';
}

export const PICTOS: Record<Ciel, string> = {
  clair: '☀️',
  voile: '🌤️',
  couvert: '☁️',
  brouillard: '🌫️',
  bruine: '🌦️',
  pluie: '🌧️',
  neige: '🌨️',
  averses: '🌦️',
  orage: '⛈️',
  inconnu: '🌡️',
};
