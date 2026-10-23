/**
 * villes — un petit répertoire de villes, EMBARQUÉ. Pur.
 *
 * Pourquoi pas un service de géocodage : il faudrait un second domaine réseau
 * et, surtout, envoyer ce que l'utilisateur tape à chaque recherche. Une
 * extension réseau doit demander le MOINS possible : on ne parle qu'à
 * `api.open-meteo.com`, et seulement pour une prévision que l'utilisateur a
 * demandée. Une ville absente de la liste se saisit par ses coordonnées.
 */

export interface Ville {
  nom: string;
  pays: string;
  lat: number;
  lon: number;
}

export const VILLES: readonly Ville[] = [
  { nom: 'Paris', pays: 'FR', lat: 48.8566, lon: 2.3522 },
  { nom: 'Marseille', pays: 'FR', lat: 43.2965, lon: 5.3698 },
  { nom: 'Lyon', pays: 'FR', lat: 45.764, lon: 4.8357 },
  { nom: 'Toulouse', pays: 'FR', lat: 43.6047, lon: 1.4442 },
  { nom: 'Nice', pays: 'FR', lat: 43.7102, lon: 7.262 },
  { nom: 'Nantes', pays: 'FR', lat: 47.2184, lon: -1.5536 },
  { nom: 'Montpellier', pays: 'FR', lat: 43.6108, lon: 3.8767 },
  { nom: 'Strasbourg', pays: 'FR', lat: 48.5734, lon: 7.7521 },
  { nom: 'Bordeaux', pays: 'FR', lat: 44.8378, lon: -0.5792 },
  { nom: 'Lille', pays: 'FR', lat: 50.6292, lon: 3.0573 },
  { nom: 'Rennes', pays: 'FR', lat: 48.1173, lon: -1.6778 },
  { nom: 'Reims', pays: 'FR', lat: 49.2583, lon: 4.0317 },
  { nom: 'Grenoble', pays: 'FR', lat: 45.1885, lon: 5.7245 },
  { nom: 'Dijon', pays: 'FR', lat: 47.322, lon: 5.0415 },
  { nom: 'Brest', pays: 'FR', lat: 48.3904, lon: -4.4861 },
  { nom: 'Clermont-Ferrand', pays: 'FR', lat: 45.7772, lon: 3.087 },
  { nom: 'Chamonix-Mont-Blanc', pays: 'FR', lat: 45.9237, lon: 6.8694 },
  { nom: 'Ajaccio', pays: 'FR', lat: 41.9192, lon: 8.7386 },
  { nom: 'Pointe-à-Pitre', pays: 'FR', lat: 16.2411, lon: -61.5331 },
  { nom: 'Saint-Denis (La Réunion)', pays: 'FR', lat: -20.8823, lon: 55.4504 },
  { nom: 'Bruxelles', pays: 'BE', lat: 50.8503, lon: 4.3517 },
  { nom: 'Genève', pays: 'CH', lat: 46.2044, lon: 6.1432 },
  { nom: 'Montréal', pays: 'CA', lat: 45.5019, lon: -73.5674 },
  { nom: 'Québec', pays: 'CA', lat: 46.8139, lon: -71.208 },
  { nom: 'Dakar', pays: 'SN', lat: 14.7167, lon: -17.4677 },
  { nom: 'Abidjan', pays: 'CI', lat: 5.36, lon: -4.0083 },
  { nom: 'Casablanca', pays: 'MA', lat: 33.5731, lon: -7.5898 },
  { nom: 'London', pays: 'GB', lat: 51.5072, lon: -0.1276 },
  { nom: 'Berlin', pays: 'DE', lat: 52.52, lon: 13.405 },
  { nom: 'Madrid', pays: 'ES', lat: 40.4168, lon: -3.7038 },
  { nom: 'Barcelona', pays: 'ES', lat: 41.3874, lon: 2.1686 },
  { nom: 'Roma', pays: 'IT', lat: 41.9028, lon: 12.4964 },
  { nom: 'Lisboa', pays: 'PT', lat: 38.7223, lon: -9.1393 },
  { nom: 'Amsterdam', pays: 'NL', lat: 52.3676, lon: 4.9041 },
  { nom: 'New York', pays: 'US', lat: 40.7128, lon: -74.006 },
  { nom: 'San Francisco', pays: 'US', lat: 37.7749, lon: -122.4194 },
  { nom: 'Tokyo', pays: 'JP', lat: 35.6762, lon: 139.6503 },
  { nom: 'Sydney', pays: 'AU', lat: -33.8688, lon: 151.2093 },
];

/** Sans accents, sans casse, sans ponctuation : « saint-denis » trouve « Saint-Denis (La Réunion) ». */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function chercherVilles(requete: string, max = 8): Ville[] {
  const q = normaliser(requete);
  if (!q) return [];
  const debut = VILLES.filter((v) => normaliser(v.nom).startsWith(q));
  const ailleurs = VILLES.filter((v) => !debut.includes(v) && normaliser(v.nom).includes(q));
  return [...debut, ...ailleurs].slice(0, max);
}

export function villeExacte(nom: string): Ville | null {
  const q = normaliser(nom);
  return VILLES.find((v) => normaliser(v.nom) === q) ?? null;
}
