import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HAUTEUR_MAX,
  HAUTEUR_NOTE,
  LARGEUR_MAX,
  LARGEUR_NOTE,
  ajouterNote,
  couleurSuivante,
  deplacerNote,
  ecrireNote,
  ecrirePenseBete,
  lirePenseBete,
  placeLibre,
  premierPlan,
  supprimerNote,
  tableauVide,
} from '../postit';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe('format .postit', () => {
  it('0 octet = tableau neuf', () => {
    expect(lirePenseBete(new Uint8Array(0))).toEqual({ ok: true, tableau: { notes: [] }, repare: false });
  });

  it.each(['semaine.postit', 'atelier.postit'])('relit et réécrit %s à l’octet près', (nom) => {
    const octets = exemple(nom);
    const lu = lirePenseBete(octets);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(false);
    expect(Buffer.from(ecrirePenseBete(lu.tableau))).toEqual(Buffer.from(octets));
  });

  it('refuse ce qui n’est pas à lui, avec la raison', () => {
    expect(lirePenseBete(new TextEncoder().encode('{pas du json'))).toEqual({ ok: false, raison: 'json' });
    expect(lirePenseBete(json({ format: 'autre', version: 1, notes: [] }))).toEqual({ ok: false, raison: 'format' });
    expect(lirePenseBete(json({ format: 'filarr-postit', version: 2, notes: [] }))).toEqual({ ok: false, raison: { version: 2 } });
  });

  it('borne et répare une note fabriquée par quelqu’un d’autre', () => {
    const lu = lirePenseBete(
      json({
        format: 'filarr-postit',
        version: 1,
        notes: [
          { id: 'ok', x: -50, y: 1e9, couleur: 'fuchsia', texte: 'a'.repeat(20_000) },
          { id: 'ok', x: 1, y: 2, couleur: 'bleu', texte: 'doublon' },
          { id: '<script>', x: 'x', y: 2, couleur: 'vert' },
          'n’importe quoi',
        ],
      })
    );
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(true);
    const [a, b, c] = lu.tableau.notes;
    expect(lu.tableau.notes).toHaveLength(3);
    expect(a).toMatchObject({ id: 'ok', x: 0, y: HAUTEUR_MAX - HAUTEUR_NOTE, couleur: 'jaune' });
    expect(a.texte).toHaveLength(10_000);
    expect(b.id).not.toBe('ok');
    expect(c.id).toMatch(/^n-[0-9a-f]{12}$/);
    expect(c.texte).toBe('');
  });
});

describe('opérations', () => {
  it('ajoute, déplace (borné), écrit, recolore, supprime', () => {
    let t = ajouterNote(tableauVide(), 10, 10, 'jaune', 'n-1');
    t = deplacerNote(t, 'n-1', 99_999, -3);
    expect(t.notes[0]).toMatchObject({ x: LARGEUR_MAX - LARGEUR_NOTE, y: 0 });
    t = ecrireNote(t, 'n-1', 'bonjour');
    expect(t.notes[0].texte).toBe('bonjour');
    expect(couleurSuivante('violet')).toBe('jaune');
    expect(supprimerNote(t, 'n-1').notes).toEqual([]);
  });

  it('ne modifie jamais le tableau d’origine', () => {
    const t = ajouterNote(tableauVide(), 0, 0, 'rose', 'n-1');
    const avant = JSON.stringify(t);
    deplacerNote(t, 'n-1', 50, 50);
    ecrireNote(t, 'n-1', 'x');
    expect(JSON.stringify(t)).toBe(avant);
  });

  it('passe une note au premier plan', () => {
    let t = ajouterNote(tableauVide(), 0, 0, 'rose', 'a');
    t = ajouterNote(t, 0, 0, 'bleu', 'b');
    expect(premierPlan(t, 'a').notes.map((n) => n.id)).toEqual(['b', 'a']);
    expect(premierPlan(t, 'b')).toBe(t);
  });

  it('trouve une place libre en cascade', () => {
    let t = tableauVide();
    const vues = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const p = placeLibre(t);
      vues.add(`${p.x},${p.y}`);
      t = ajouterNote(t, p.x, p.y, 'jaune');
    }
    expect(vues.size).toBe(12);
  });
});
