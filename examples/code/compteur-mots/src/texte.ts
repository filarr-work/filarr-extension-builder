/**
 * texte — le FORMAT `.wc` : du texte brut UTF-8, et rien d'autre.
 *
 * Deux détails qu'un éditeur de texte doit à ses fichiers, faute de quoi la
 * première ouverture les réécrit sans que l'utilisateur ait touché à rien :
 *
 *  - la marque d'ordre (BOM) : `TextDecoder` l'avale, on la note et on la rend ;
 *  - les fins de ligne : un `<textarea>` transforme `\r\n` en `\n`. On garde la
 *    convention majoritaire du fichier et on la réapplique à l'écriture.
 *
 * Un fichier qui n'est pas de l'UTF-8 valide (ou qui contient des octets nuls,
 * signe d'un binaire) est REFUSÉ, pas « réparé » : le décoder en remplaçant les
 * octets invalides puis l'enregistrer détruirait son contenu.
 */

export type FinDeLigne = '\n' | '\r\n';

export type Lecture =
  | { ok: true; texte: string; bom: boolean; finDeLigne: FinDeLigne }
  | { ok: false };

const BOM = [0xef, 0xbb, 0xbf];

export function lireTexte(octets: Uint8Array): Lecture {
  const bom = octets.length >= 3 && BOM.every((b, i) => octets[i] === b);
  let brut: string;
  try {
    brut = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bom ? octets.subarray(3) : octets);
  } catch {
    return { ok: false };
  }
  if (brut.includes('\u0000')) return { ok: false };
  const crlf = (brut.match(/\r\n/g) ?? []).length;
  const lf = (brut.match(/\n/g) ?? []).length;
  const finDeLigne: FinDeLigne = crlf > 0 && crlf * 2 >= lf ? '\r\n' : '\n';
  return { ok: true, texte: brut.replace(/\r\n?/g, '\n'), bom, finDeLigne };
}

export function ecrireTexte(texte: string, bom: boolean, finDeLigne: FinDeLigne): Uint8Array {
  const corps = new TextEncoder().encode(finDeLigne === '\n' ? texte : texte.replace(/\n/g, '\r\n'));
  if (!bom) return corps;
  const out = new Uint8Array(corps.length + BOM.length);
  out.set(BOM);
  out.set(corps, BOM.length);
  return out;
}
