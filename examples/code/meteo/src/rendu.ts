/**
 * rendu — une mesure en mots, pour l'éditeur comme pour le widget.
 */

import type { Langue, Textes } from './i18n';
import { cielDe, type Meteo } from './openmeteo';

export function texteMesure(m: Meteo, t: Textes, langue: Langue): string {
  const f = (n: number) => n.toLocaleString(langue, { maximumFractionDigits: 1 });
  const base = t.mesure(f(m.temperature), t.ciel[cielDe(m.code)], m.vent === null ? null : f(m.vent), m.humidite === null ? null : f(m.humidite));
  return m.heure ? `${base} (${t.majA(m.heure.slice(11))})` : base;
}
