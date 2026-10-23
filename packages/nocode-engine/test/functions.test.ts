import { describe, expect, it } from 'vitest';
import { createPlugin, exportDocument, extractText, fieldValues } from '../src/index';
import { contactConfig, dec, enc, inventaireConfig, recetteConfig } from './fixtures';

const recette = enc(
  JSON.stringify({
    titre: 'Tarte aux pommes',
    categorie: 'dessert',
    portions: 6,
    temps: '45',
    ingredients: [
      { pris: true, nom: 'pommes' },
      { pris: false, nom: 'pâte <brisée>' },
    ],
    etapes: ['Éplucher', 'Cuire 45 min'],
    notes: 'Servir tiède.',
  })
);

describe('extractText', () => {
  it('rassemble le texte des champs, libellés de choix compris', () => {
    const t = extractText(recetteConfig, recette, 'fr');
    expect(t).toContain('Tarte aux pommes');
    expect(t).toContain('Dessert');
    expect(t).toContain('pâte <brisée>');
    expect(t).toContain('Cuire 45 min');
    expect(t).toContain('Servir tiède.');
  });

  it('clé: valeur, et écrêté à 100 000 caractères', () => {
    expect(extractText(contactConfig, enc('nom: Ada\nemail: ada@example.org\n'), 'fr')).toBe('Ada\nada@example.org');
    const long = enc(JSON.stringify({ notes: 'x'.repeat(200_000) }));
    expect(extractText(recetteConfig, long, 'fr').length).toBe(100_000);
  });

  it('un document illisible fait jeter un code', () => {
    expect(() => extractText(recetteConfig, enc('{"__proto__":{}}'), 'fr')).toThrow('document_forbidden_key');
  });
});

describe('fields', () => {
  it('rend les colonnes déclarées, au bon type', () => {
    expect(fieldValues(recetteConfig, recette, 'fr')).toEqual({ portions: 6, temps: 45, categorie: 'Dessert' });
    expect(fieldValues(recetteConfig, recette, 'en').categorie).toBe('Dessert');
    expect(fieldValues(inventaireConfig, enc('article,quantite\nvis,10\nclou,2\n'), 'fr')).toEqual({ total: 12 });
  });
});

describe('export', () => {
  it('markdown : titre, pastilles, cases, étapes, échappement', () => {
    const md = dec(exportDocument(recetteConfig, recette, 'md', 'fr', 'tarte.recette'));
    expect(md).toMatch(/^# Tarte aux pommes/);
    expect(md).toContain('- **Catégorie** : Dessert');
    expect(md).toContain('- [x] pommes');
    expect(md).toContain('- [ ] pâte \\<brisée\\>');
    expect(md).toContain('1. Éplucher');
  });

  it('html : un document autonome, chaque texte échappé, aucun script', () => {
    const html = dec(exportDocument(recetteConfig, recette, 'html', 'fr', 'tarte.recette'));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('pâte &lt;brisée&gt;');
    expect(html).not.toMatch(/<script|<brisée>/);
    expect(html).toContain("default-src 'none'");
  });

  it('json d’un document JSON : lui-même, rien de perdu', () => {
    const avecInconnu = enc('{"titre":"a","secret":{"k":1}}');
    expect(JSON.parse(dec(exportDocument(recetteConfig, avecInconnu, 'json', 'fr', 'a.recette'))).secret).toEqual({ k: 1 });
  });

  it('csv d’un CSV : le fichier ; une cible non déclarée est refusée', () => {
    const csv = enc('article,quantite\nvis,10\n');
    expect(dec(exportDocument(inventaireConfig, csv, 'csv', 'fr', 'stock.inventaire'))).toBe('article,quantite\nvis,10\n');
    expect(() => exportDocument(inventaireConfig, csv, 'md', 'fr', 'stock.inventaire')).toThrow('export_unsupported');
  });

  it('plugin.functions : présent seulement si la configuration le déclare, et rend des octets', async () => {
    const plugin = createPlugin(recetteConfig);
    const out = await plugin.functions!.export!(recette, { fileName: 'tarte.recette', to: 'txt', locale: 'fr' });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(dec(out as Uint8Array)).toContain('TARTE AUX POMMES');
    const sans = createPlugin({ ...recetteConfig, functions: undefined });
    expect(sans.functions).toBeUndefined();
  });
});
