/**
 * fonctions — ce que Filarr appelle sans ouvrir l'éditeur (capacité `functions`) :
 *
 *  - `extractText` : le texte PARLÉ, pour la recherche — sans numéros, sans
 *    temps, sans balises : chercher « rendez-vous » doit trouver la réplique,
 *    pas « 00:01:02,500 » ;
 *  - `export` vers `txt` : une transcription lisible, en paragraphes (un
 *    silence de plus de deux secondes ouvre un paragraphe) ;
 *  - `export` vers `json` : les répliques avec leurs temps, pour un autre outil.
 *
 * Elles acceptent aussi un `.vtt` : la lecture reconnaît le format à son contenu.
 */

import { ecrireTemps, lireSousTitres, type SousTitre } from './srt';

/** Au-delà, une pause ouvre un nouveau paragraphe de la transcription. */
export const PAUSE_PARAGRAPHE_MS = 2000;
const EXTRAIT_MAX = 100_000;

function lire(octets: Uint8Array, nom: string): SousTitre[] {
  const lu = lireSousTitres(octets, nom);
  if (!lu.ok) throw new Error('sous-titres illisibles');
  return lu.fichier.sousTitres;
}

/** Le texte tel qu'on l'entend : balises et indications de position retirées, lignes jointes. */
export function texteParle(texte: string): string {
  return texte
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
}

export function extraire(liste: SousTitre[]): string {
  return liste
    .map((s) => texteParle(s.texte))
    .filter(Boolean)
    .join('\n')
    .slice(0, EXTRAIT_MAX);
}

export function transcription(liste: SousTitre[]): string {
  const paragraphes: string[][] = [];
  let fin = -Infinity;
  for (const s of liste) {
    const t = texteParle(s.texte);
    if (!t) continue;
    if (paragraphes.length === 0 || s.debut - fin > PAUSE_PARAGRAPHE_MS) paragraphes.push([]);
    paragraphes[paragraphes.length - 1].push(t);
    fin = Math.max(fin, s.fin);
  }
  return paragraphes.map((p) => p.join(' ')).join('\n\n') + (paragraphes.length ? '\n' : '');
}

export function versJson(liste: SousTitre[]): string {
  return (
    JSON.stringify(
      liste.map((s, i) => ({
        index: i + 1,
        debut_ms: s.debut,
        fin_ms: s.fin,
        debut: ecrireTemps(s.debut),
        fin: ecrireTemps(s.fin),
        texte: s.texte,
      })),
      null,
      2
    ) + '\n'
  );
}

export const fonctions: FilarrFunctions = {
  extractText(octets, ctx) {
    return extraire(lire(octets, ctx.fileName));
  },
  export(octets, ctx) {
    const liste = lire(octets, ctx.fileName);
    if (ctx.to === 'txt') return new TextEncoder().encode(transcription(liste));
    if (ctx.to === 'json') return new TextEncoder().encode(versJson(liste));
    throw new Error(`export vers ${String(ctx.to)} non pris en charge`);
  },
};
