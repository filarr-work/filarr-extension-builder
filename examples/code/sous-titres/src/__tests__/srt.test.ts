import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extraire, fonctions, texteParle, transcription, versJson } from '../fonctions';
import { decaler, estTrie, inserer, modifier, probleme, supprimer, trier } from '../operations';
import { ecrireSrt, ecrireTemps, lireSousTitres, lireTemps, nettoyerTexte, texteDepuisVtt, type Fichier } from '../srt';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);
const lire = (o: Uint8Array, nom = 'x.srt'): Fichier => {
  const lu = lireSousTitres(o, nom);
  if (!lu.ok) throw new Error(lu.raison);
  return lu.fichier;
};

describe('temps', () => {
  it('lit les formats SRT et WebVTT, et refuse le reste', () => {
    expect(lireTemps('00:01:02,500')).toBe(62_500);
    expect(lireTemps('01:02.5')).toBe(62_500);
    expect(lireTemps('1:00:00.000')).toBe(3_600_000);
    expect(lireTemps('00:61:00,000')).toBeNull();
    expect(lireTemps('demain')).toBeNull();
  });

  it('écrit HH:MM:SS,mmm', () => {
    expect(ecrireTemps(62_500)).toBe('00:01:02,500');
    expect(ecrireTemps(-5)).toBe('00:00:00,000');
    expect(ecrireTemps(3_723_004)).toBe('01:02:03,004');
  });
});

describe('format SRT', () => {
  it.each(['court-metrage.srt', 'entretien-bom.srt'])('relit et réécrit %s à l’octet près (CRLF, BOM)', (nom) => {
    const o = exemple(nom);
    expect(Buffer.from(ecrireSrt(lire(o)))).toEqual(Buffer.from(o));
  });

  it('0 octet = fichier neuf, sans sous-titre', () => {
    const f = lire(new Uint8Array(0));
    expect(f.sousTitres).toEqual([]);
    expect(ecrireSrt(f).byteLength).toBe(0);
  });

  it('tolère un numéro absent, renumérote, et compte les blocs illisibles', () => {
    const lu = lireSousTitres(enc('00:00:01,000 --> 00:00:02,000\nSans numéro\n\n7\nn’importe quoi\n\n9\n00:00:03,000 --> 00:00:04,000\nDeux\n'));
    if (!lu.ok) throw new Error();
    expect(lu.blocsIllisibles).toBe(1);
    expect(new TextDecoder().decode(ecrireSrt(lu.fichier))).toBe(
      '1\n00:00:01,000 --> 00:00:02,000\nSans numéro\n\n2\n00:00:03,000 --> 00:00:04,000\nDeux\n'
    );
  });

  it('refuse un fichier sans aucun bloc, ou qui n’est pas de l’UTF-8', () => {
    expect(lireSousTitres(enc('ceci est une liste de courses'))).toEqual({ ok: false, raison: 'format' });
    expect(lireSousTitres(new Uint8Array([0xc3, 0x28]))).toEqual({ ok: false, raison: 'encodage' });
  });

  it('ne laisse jamais une ligne vide dans un texte (elle couperait le bloc)', () => {
    expect(nettoyerTexte('un\n\n  \ndeux  \r\n')).toBe('un\ndeux');
  });
});

describe('import WebVTT', () => {
  const lu = lireSousTitres(exemple('conference.vtt'), 'conference.vtt');
  if (!lu.ok) throw new Error('illisible');

  it('reconnaît le format, et compte ce que SRT ne peut pas porter', () => {
    expect(lu.import).toEqual({ depuis: 'vtt', reglagesIgnores: 2, blocsIgnores: 2 });
    expect(lu.fichier.sousTitres).toHaveLength(6);
    expect(lu.fichier.sousTitres[0]).toEqual({ debut: 1000, fin: 4500, texte: 'Alice: Bonjour à toutes et à tous.' });
    expect(lu.fichier.sousTitres[5].debut).toBe(3_723_000);
  });

  it('garde <i>, <b>, <u> ; retire voix, classes et horodatages ; décode les entités', () => {
    expect(lu.fichier.sousTitres[1].texte).toBe('Alice: Aujourd’hui : comment chiffrer\nde bout en bout <i>sans</i> se perdre.');
    expect(lu.fichier.sousTitres[2].texte).toBe('Bruno: Et si je perds ma clé ?');
    expect(lu.fichier.sousTitres[4].texte).toBe('(rires) & applaudissements');
    expect(texteDepuisVtt('a <00:00:01.000>b <c.x>c</c> <b>d</b>')).toBe('a b c <b>d</b>');
  });

  it('écrit du SRT, qui se relit à l’identique', () => {
    const srt = ecrireSrt(lu.fichier);
    expect(new TextDecoder().decode(srt).startsWith('1\n00:00:01,000 --> 00:00:04,500\nAlice: Bonjour')).toBe(true);
    expect(Buffer.from(ecrireSrt(lire(srt)))).toEqual(Buffer.from(srt));
  });

  it('un .vtt sans en-tête WEBVTT est refusé', () => {
    expect(lireSousTitres(enc('00:01.000 --> 00:02.000\nx'), 'a.vtt')).toEqual({ ok: false, raison: 'format' });
  });
});

describe('opérations', () => {
  const base = lire(exemple('court-metrage.srt')).sousTitres;

  it('insère dans le trou qui suit, sans chevaucher', () => {
    const r = inserer(base, 0);
    expect(r.index).toBe(1);
    expect(r.liste[1]).toEqual({ debut: 3600, fin: 3900, texte: '' });
    expect(probleme(r.liste, 1)).toBeNull();
    expect(inserer([], -1).liste).toEqual([{ debut: 0, fin: 2000, texte: '' }]);
  });

  it('signale sans corriger', () => {
    const l = modifier(base, 0, { fin: 5000 });
    expect(probleme(l, 0)).toBe('chevauche_suivant');
    expect(probleme(modifier(base, 0, { fin: 1000 }), 0)).toBe('fin_avant_debut');
    expect(l[0].fin).toBe(5000);
  });

  it('décale sans passer sous zéro, trie, supprime', () => {
    const avance = decaler(base, -2000);
    expect(avance[0]).toMatchObject({ debut: 0, fin: 2200 });
    expect(decaler(base, 0)).toBe(base);
    const melange = [base[2], base[0], base[1]];
    expect(estTrie(melange)).toBe(false);
    expect(trier(melange)).toEqual([base[0], base[1], base[2]]);
    expect(supprimer(base, 0)).toHaveLength(base.length - 1);
  });
});

describe('fonctions pures', () => {
  const ctx = { fileName: 'court-metrage.srt', locale: 'fr' };

  it('extractText : ce qui est dit, sans temps ni balises', () => {
    const t = fonctions.extractText!(exemple('court-metrage.srt'), ctx) as string;
    expect(t.split('\n')[0]).toBe('Lyon, un matin de novembre.');
    expect(t).not.toMatch(/\d\d:\d\d/);
    expect(t).not.toContain('<i>');
    expect(texteParle('{\\an8}<b>Haut</b>\nde l’écran')).toBe('Haut de l’écran');
    expect(extraire([])).toBe('');
  });

  it('export txt : des paragraphes séparés par les silences', () => {
    const txt = new TextDecoder().decode(fonctions.export!(exemple('court-metrage.srt'), { ...ctx, to: 'txt' }) as Uint8Array);
    expect(txt.split('\n\n')).toHaveLength(3);
    expect(transcription([])).toBe('');
  });

  it('export json : temps en millisecondes et en clair', () => {
    const j = JSON.parse(versJson(lire(exemple('entretien-bom.srt')).sousTitres));
    expect(j[1]).toMatchObject({ index: 2, debut_ms: 4600, fin: '00:00:09,800' });
  });

  it('accepte un .vtt, et refuse une cible non déclarée', () => {
    expect(fonctions.extractText!(exemple('conference.vtt'), { ...ctx, fileName: 'c.vtt' })).toContain('Bruno: Et si je perds ma clé ?');
    expect(() => fonctions.export!(exemple('court-metrage.srt'), { ...ctx, to: 'csv' })).toThrow();
  });
});
