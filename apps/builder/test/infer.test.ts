import { describe, expect, it } from 'vitest';
import { validateConfig, type NocodeConfig } from '@filarr/nocode-engine';
import { detectFormat, humanize, inferFields } from '../src/lib/infer';
import { blockAt, createBlock, defaultView, insertBlock, moveBlock, removeBlock, rootLevel, updateBlock } from '../src/lib/compose';
import { changeType, flattenFields } from '../src/lib/fields';

const RECETTE = JSON.stringify({
  titre: 'Tarte aux pommes',
  portions: 6,
  temps: 55,
  categorie: 'Dessert',
  ingredients: [
    { nom: 'Pommes', quantite: '6' },
    { nom: 'Pâte brisée', quantite: '1' },
  ],
  etapes: ['Préchauffer le four à 180 °C.', 'Étaler la pâte, piquer le fond.'],
  notes: 'Meilleure tiède.',
  'a.b': 1,
  publie: '2026-10-01',
  site: 'https://exemple.org/tarte',
}, null, 2);

const config = (format: NocodeConfig['format'], fields: NocodeConfig['fields']): NocodeConfig => ({ nocode: 1, id: 'essai', format, fields, view: defaultView({ format, fields }) });

describe('inférence des champs', () => {
  it('JSON : types, listes d’objets, clés inutilisables signalées', () => {
    const r = inferFields(RECETTE, undefined, 'tarte.recette');
    expect(r.format).toEqual({ type: 'json' });
    const byKey = Object.fromEntries(r.fields.map((f) => [f.key, f]));
    expect(byKey.titre.type).toBe('text');
    expect(byKey.portions).toMatchObject({ type: 'number', step: 1 });
    expect(byKey.ingredients.type).toBe('list');
    expect(byKey.ingredients.fields?.map((f) => f.key)).toEqual(['nom', 'quantite']);
    expect(byKey.etapes.type).toBe('textlist');
    expect(byKey.publie.type).toBe('date');
    expect(byKey.site.type).toBe('url');
    expect(byKey['a.b']).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/a\.b/);
    expect(r.values.categorie).toEqual(['Dessert']);
    expect(flattenFields(r.fields).map((x) => x.path)).toContain('ingredients[].nom');
  });

  it('refuse une clé interdite et une racine qui n’est pas un objet', () => {
    expect(() => inferFields('{"__proto__": {"x": 1}}', { type: 'json' })).toThrow(/__proto__/);
    expect(() => inferFields('[1, 2]', { type: 'json' })).toThrow(/objet/);
  });

  it('CSV au point-virgule : nombres à virgule, cases oui/non', () => {
    const r = inferFields('article;quantite;prix;fait\nPain;2;1,20;oui\nLait;1;0,95;non\n');
    expect(r.format).toEqual({ type: 'csv', delimiter: ';' });
    expect(r.fields.find((f) => f.key === 'prix')).toMatchObject({ type: 'number', decimals: 2 });
    expect(r.fields.find((f) => f.key === 'fait')).toMatchObject({ type: 'boolean', trueValue: 'oui', falseValue: 'non' });
  });

  it('lignes à cocher et clé : valeur', () => {
    expect(detectFormat('# Courses\n[ ] lait\n[x] pain\n')).toBe('lines');
    const kv = inferFields('nom: Ada\nage: 36\nsite: https://ada.example\n');
    expect(kv.format).toEqual({ type: 'keyvalue' });
    expect(kv.fields.map((f) => [f.key, f.type])).toEqual([['nom', 'text'], ['age', 'number'], ['site', 'url']]);
  });

  it('humanise les clés', () => {
    expect(humanize('date_naissance')).toBe('Date naissance');
    expect(humanize('nombrePortions')).toBe('Nombre Portions');
  });
});

describe('composition de la vue', () => {
  it('la vue proposée est acceptée par le moteur, pour chaque format', () => {
    const cases: [string, NocodeConfig['format'] | undefined][] = [
      [RECETTE, undefined],
      ['article;quantite;prix\nPain;2;1,20\n', undefined],
      ['[ ] lait\n[x] pain\n', undefined],
      ['nom: Ada\nage: 36\n', undefined],
    ];
    for (const [text, fmt] of cases) {
      const r = inferFields(text, fmt);
      const c = config(r.format, r.fields);
      expect(c.view.length).toBeGreaterThan(0);
      const v = validateConfig(c);
      expect(v.issues).toEqual([]);
    }
  });

  it('chaque bloc de la palette créé sur la recette est valide', () => {
    const r = inferFields(RECETTE);
    const base = config(r.format, r.fields);
    const level = rootLevel(base);
    for (const type of ['title', 'badges', 'steps', 'longtext', 'number', 'table', 'fields', 'link', 'rating', 'progress', 'total', 'section', 'cards', 'date'] as const) {
      const b = createBlock(type, level);
      expect(b, type).not.toBeNull();
      const v = validateConfig({ ...base, view: [b!] });
      expect(v.issues, type).toEqual([]);
    }
  });

  it('ajoute, déplace, règle et retire, y compris dans une carte', () => {
    const r = inferFields(RECETTE);
    const c = config(r.format, r.fields);
    let view = insertBlock(c.view, [], 0, createBlock('cards', rootLevel(c))!);
    expect(view[0].type).toBe('cards');
    const moved = moveBlock(view, [0], 1);
    expect(moved.path).toEqual([1]);
    view = moved.view;
    view = updateBlock(view, [1, 0], (b) => ({ ...b, placeholder: 'Nom' }) as typeof b);
    expect(blockAt(view, [1, 0])).toMatchObject({ type: 'title', placeholder: 'Nom' });
    expect(validateConfig({ ...c, view }).issues).toEqual([]);
    view = removeBlock(view, [1]);
    expect(view.length).toBe(c.view.length);
  });

  it('changer de type ne garde que les propriétés permises et propose les options vues', () => {
    const f = changeType({ key: 'categorie', type: 'text', label: 'Catégorie', placeholder: 'x' }, 'choice', ['Dessert', 'Plat']);
    expect(f).toEqual({ key: 'categorie', type: 'choice', label: 'Catégorie', options: [{ value: 'Dessert' }, { value: 'Plat' }] });
  });
});
