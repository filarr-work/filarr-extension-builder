import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOTS_PAR_MINUTE, compter, compterMots, graphemes } from '../compte';
import { ecrireTexte, lireTexte } from '../texte';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));

describe('compte', () => {
  it('compte les mots à la française', () => {
    expect(compterMots('')).toBe(0);
    expect(compterMots("   \n\t ")).toBe(0);
    expect(compterMots("Aujourd'hui, le porte-monnaie est vide.")).toBe(5);
    expect(compterMots('Il vaut 3.14 — ou à peu près !')).toBe(7);
    expect(compterMots('l’apostrophe typographique compte aussi')).toBe(4);
  });

  it('compte les caractères comme l’œil les voit', () => {
    expect(graphemes('été')).toBe(3);
    expect(graphemes('é')).toBe(1);
    expect(graphemes('👍🏽')).toBe(1);
    expect(compter('a b').caracteresSansEspaces).toBe(2);
  });

  it('donne un temps de lecture arrondi, jamais nul dès qu’il y a un mot', () => {
    expect(compter('').minutesLecture).toBe(0);
    expect(compter('mot').minutesLecture).toBe(1);
    expect(compter(Array(MOTS_PAR_MINUTE * 3).fill('mot').join(' ')).minutesLecture).toBe(3);
  });
});

describe('texte', () => {
  it('rend un fichier vide comme un document neuf', () => {
    const lu = lireTexte(new Uint8Array(0));
    expect(lu).toEqual({ ok: true, texte: '', bom: false, finDeLigne: '\n' });
  });

  it.each(['lettre.wc', 'notes-crlf.wc', 'avec-bom.wc'])('relit %s à l’octet près', (nom) => {
    const octets = exemple(nom);
    const lu = lireTexte(octets);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.texte).not.toContain('\r');
    expect(Buffer.from(ecrireTexte(lu.texte, lu.bom, lu.finDeLigne))).toEqual(Buffer.from(octets));
  });

  it('garde le BOM et les CRLF', () => {
    const lu = lireTexte(exemple('avec-bom.wc'));
    expect(lu.ok && lu.bom).toBe(true);
    const crlf = lireTexte(exemple('notes-crlf.wc'));
    expect(crlf.ok && crlf.finDeLigne).toBe('\r\n');
  });

  it("refuse ce qui n'est pas de l'UTF-8, au lieu de l'abîmer", () => {
    expect(lireTexte(new Uint8Array([0xc3, 0x28])).ok).toBe(false);
    expect(lireTexte(new Uint8Array([0x41, 0x00, 0x42])).ok).toBe(false);
  });
});
