/**
 * fonctions — ce que Filarr appelle SANS ouvrir l'éditeur (capacité
 * `functions`) : la vignette de la carte du fichier et les exports.
 *
 * Ces fonctions tournent dans une page sans aucune API (ni stockage, ni
 * sélecteur, ni réseau), sur un fichier que FILARR a choisi. Elles sont pures :
 * des octets entrent, des octets sortent. Un fichier illisible les fait
 * rejeter avec un message — l'hôte le traite comme un échec, jamais comme une
 * donnée.
 *
 * ⚠ Le manifeste déclare `exports` ; le bundle expose `export`, avec la cible
 * dans `ctx.to` (`sandboxProtocol.ts`).
 */

import { cheminSvg, lireCroquis, type Croquis } from './croquis';
import { Toile, rvbDe } from './png';

/** La vignette tient dans 160 × 120 : quelque 19 Kio, sous les 96 Kio permis. */
const VIGNETTE_L = 160;
const VIGNETTE_H = 120;

function lire(octets: Uint8Array): Croquis {
  const lu = lireCroquis(octets);
  if (!lu.ok) throw new Error('croquis illisible');
  return lu.croquis;
}

export function vignette(c: Croquis): Uint8Array {
  const echelle = Math.min(VIGNETTE_L / c.largeur, VIGNETTE_H / c.hauteur);
  const l = Math.max(1, Math.round(c.largeur * echelle));
  const h = Math.max(1, Math.round(c.hauteur * echelle));
  const toile = new Toile(l, h, rvbDe(c.fond, [255, 255, 255]));
  for (const t of c.traits) {
    const i = toile.indice(rvbDe(t.couleur));
    // Un trait fin reste visible en réduction : au moins un demi-pixel de rayon.
    const r = Math.max(0.6, (t.epaisseur * echelle) / 2);
    const p = t.points;
    if (p.length === 2) toile.disque(p[0] * echelle, p[1] * echelle, r, i);
    for (let k = 2; k < p.length; k += 2) {
      toile.segment(p[k - 2] * echelle, p[k - 1] * echelle, p[k] * echelle, p[k + 1] * echelle, r, i);
    }
  }
  return toile.png();
}

/** Le texte d'un nom de fichier, sûr dans du HTML : `&`, `<`, `>`, `"`, `'` échappés. */
export function echapperHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Un SVG autonome. Rien n'y vient du fichier sans validation : nombres et couleurs `#rrggbb`. */
export function svgAutonome(c: Croquis): string {
  const chemins = c.traits
    .map((t) => `<path d="${cheminSvg(t)}" stroke="${t.couleur}" stroke-width="${t.epaisseur}"/>`)
    .join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.largeur} ${c.hauteur}" width="${c.largeur}" height="${c.hauteur}">\n` +
    `<rect width="100%" height="100%" fill="${c.fond}"/>\n` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">\n${chemins}\n</g>\n</svg>`
  );
}

export function exporterHtml(c: Croquis, nomFichier: string): Uint8Array {
  const titre = echapperHtml(nomFichier.replace(/\.croquis$/i, '') || 'Croquis');
  const html =
    `<!doctype html>\n<html><head><meta charset="utf-8"><title>${titre}</title>\n` +
    `<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#eee}svg{max-width:100vw;height:auto;box-shadow:0 1px 6px rgba(0,0,0,.2)}</style>\n` +
    `</head><body>\n${svgAutonome(c)}\n</body></html>\n`;
  return new TextEncoder().encode(html);
}

/** Les points en paires : la forme qu'un autre programme lira le plus volontiers. */
export function exporterJson(c: Croquis): Uint8Array {
  const sortie = {
    largeur: c.largeur,
    hauteur: c.hauteur,
    fond: c.fond,
    traits: c.traits.map((t) => {
      const points: [number, number][] = [];
      for (let i = 0; i < t.points.length; i += 2) points.push([t.points[i], t.points[i + 1]]);
      return { couleur: t.couleur, epaisseur: t.epaisseur, points };
    }),
  };
  return new TextEncoder().encode(JSON.stringify(sortie, null, 2) + '\n');
}

export const fonctions: FilarrFunctions = {
  thumbnail(octets) {
    return vignette(lire(octets));
  },
  export(octets, ctx) {
    const c = lire(octets);
    if (ctx.to === 'html') return exporterHtml(c, ctx.fileName);
    if (ctx.to === 'json') return exporterJson(c);
    throw new Error(`export vers ${String(ctx.to)} non pris en charge`);
  },
};
