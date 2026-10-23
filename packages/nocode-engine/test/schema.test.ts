import { describe, expect, it } from 'vitest';
import { functionFieldTypes, validateConfig } from '../src/index';
import { contactConfig, coursesConfig, glossaireConfig, inventaireConfig, recetteConfig } from './fixtures';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const messages = (raw: unknown) => {
  const v = validateConfig(raw);
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};

describe('validateConfig — les configurations de référence', () => {
  it.each([
    ['json', recetteConfig],
    ['csv', inventaireConfig],
    ['lines', coursesConfig],
    ['keyvalue', contactConfig],
    ['keyvalue entries', glossaireConfig],
  ])('accepte %s', (_n, config) => {
    expect(messages(config)).toEqual([]);
  });
});

describe('validateConfig — liste fermée et références', () => {
  it('refuse une propriété inconnue, à tous les niveaux', () => {
    expect(messages({ ...clone(recetteConfig), couleur: 'rouge' }).join()).toMatch(/couleur/);
    const c = clone(recetteConfig);
    (c.fields[0] as unknown as Record<string, unknown>).placholder = 'x';
    expect(messages(c).join()).toMatch(/placholder/);
    const d = clone(recetteConfig);
    (d.view[0] as unknown as Record<string, unknown>).style = 'color:red';
    expect(messages(d).join()).toMatch(/style/);
  });

  it('refuse un bloc qui vise un champ absent ou d’un autre type', () => {
    const c = clone(recetteConfig);
    c.view.push({ type: 'number', field: 'titre' });
    c.view.push({ type: 'date', field: 'inconnu' });
    const m = messages(c).join('\n');
    expect(m).toMatch(/titre.*type text/);
    expect(m).toMatch(/inconnu.*introuvable/);
  });

  it('refuse les clés interdites et les prototypes détournés', () => {
    const c = clone(recetteConfig);
    c.fields.push({ key: '__proto__', type: 'text' });
    expect(messages(c).join()).toMatch(/interdite/);
    // Un littéral `{"__proto__": …}` évalué (et non lu par JSON.parse) change un prototype.
    const evalue = { ...clone(recetteConfig) };
    Object.setPrototypeOf(evalue, { view: [] });
    expect(validateConfig(evalue).ok).toBe(false);
    const json = JSON.parse('{"nocode":1,"__proto__":{"x":1}}');
    expect(messages(json).join()).toMatch(/__proto__/);
  });

  it('refuse un accent qui n’est pas #rrggbb (aucune injection CSS)', () => {
    expect(messages({ ...clone(recetteConfig), accent: 'red;background:url(x)' }).join()).toMatch(/accent/);
  });

  it('refuse une configuration trop imbriquée', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 20; i++) deep = [deep];
    const c = { ...clone(recetteConfig), fields: [{ key: 'a', type: 'textlist', default: deep }] };
    expect(validateConfig(c).ok).toBe(false);
  });

  it('refuse les types structurés dans un format texte', () => {
    const c = clone(inventaireConfig);
    c.fields.push({ key: 'sous', type: 'list', fields: [{ key: 'x', type: 'text' }] });
    expect(messages(c).join()).toMatch(/n’existe pas en csv/);
    const k = clone(contactConfig);
    k.fields.push({ key: 'bio', type: 'longtext' });
    expect(messages(k).join()).toMatch(/texte long/);
  });

  it('refuse une valeur par défaut d’un autre type', () => {
    const c = clone(recetteConfig);
    c.fields[2].default = 'quatre';
    expect(messages(c).join()).toMatch(/default/);
  });

  it('valide les fonctions : clés du manifeste, champs, exports', () => {
    const c = clone(recetteConfig);
    c.functions = { fields: [{ key: 'Portions', field: 'portions' }], exports: [{ to: 'pdf' as never }] };
    const m = messages(c).join('\n');
    expect(m).toMatch(/functions\.fields\[0\]\.key/);
    expect(m).toMatch(/functions\.exports\[0\]\.to/);
  });

  it('dit le type de chaque colonne rendue par `fields`', () => {
    expect(functionFieldTypes(recetteConfig)).toEqual([
      { key: 'portions', type: 'number' },
      { key: 'temps', type: 'number' },
      { key: 'categorie', type: 'text' },
    ]);
  });
});
