import { describe, expect, it } from 'vitest';
import { openDocument } from '../src/index';
import { readValue, writeValue, type DocFormatContext, type Scope } from '../src/model';
import type { NocodeConfig } from '../src/types';
import { contactConfig, coursesConfig, dec, enc, glossaireConfig, inventaireConfig, recetteConfig } from './fixtures';

function open(text: string | Uint8Array, config: NocodeConfig) {
  const r = openDocument(typeof text === 'string' ? enc(text) : text, config);
  if (!r.ok) throw new Error(`ouverture refusée : ${r.code} ${r.detail ?? ''}`);
  return r.doc;
}

function setTyped(scope: Scope, key: string, value: unknown, textual: boolean | DocFormatContext) {
  const def = scope.fields.find((f) => f.key === key)!;
  scope.set(key, writeValue(def, value, typeof textual === 'boolean' ? { textual } : textual));
}

function getTyped(scope: Scope, key: string, textual: boolean) {
  const def = scope.fields.find((f) => f.key === key)!;
  return readValue(def, scope.get(key), { textual });
}

describe('json — aller-retour', () => {
  const texte = [
    '{',
    '    "titre": "Tarte <b>aux</b> pommes",',
    '    "portions": 6,',
    '    "auteur": { "nom": "Camille", "année": 1987 },',
    '    "ingredients": [ { "pris": false, "nom": "farine", "marque": "X" }, "élément libre" ],',
    '    "inconnu": [1, 2, { "a": null }]',
    '}',
    '',
  ].join('\r\n');

  it('rend les octets d’origine tant que rien n’est touché (forme JSON.stringify relue)', () => {
    const doc = open(texte, recetteConfig);
    const again = JSON.parse(dec(doc.serialize()));
    expect(again).toEqual(JSON.parse(texte));
  });

  it('ne change que la clé touchée, garde l’indentation, les CRLF et le reste', () => {
    const doc = open(texte, recetteConfig);
    setTyped(doc.root, 'portions', 8, false);
    const sortie = dec(doc.serialize());
    expect(sortie).toContain('\r\n    "portions": 8,');
    const relu = JSON.parse(sortie);
    expect(relu.auteur).toEqual({ nom: 'Camille', année: 1987 });
    expect(relu.inconnu).toEqual([1, 2, { a: null }]);
    expect(relu.ingredients[1]).toBe('élément libre');
    expect(relu.ingredients[0].marque).toBe('X');
    expect(relu.titre).toBe('Tarte <b>aux</b> pommes');
    expect(sortie.endsWith('}\r\n')).toBe(true);
  });

  it('liste : un élément ajouté prend les valeurs par défaut, les éléments mal formés restent', () => {
    const doc = open(texte, recetteConfig);
    const list = doc.root.list('ingredients');
    expect(list.length()).toBe(2);
    expect(list.item(1)).toBeNull();
    const at = list.add();
    list.item(at)!.set('nom', 'sucre');
    list.move(at, 0);
    const relu = JSON.parse(dec(doc.serialize()));
    expect(relu.ingredients).toEqual([{ pris: false, nom: 'sucre' }, { pris: false, nom: 'farine', marque: 'X' }, 'élément libre']);
  });

  it('fichier vide : un document neuf aux valeurs par défaut', () => {
    const doc = open('', recetteConfig);
    expect(doc.isNew).toBe(true);
    expect(getTyped(doc.root, 'portions', false)).toBe(4);
    expect(getTyped(doc.root, 'categorie', false)).toBe('plat');
    const relu = JSON.parse(dec(doc.serialize()));
    expect(relu).toMatchObject({ titre: '', categorie: 'plat', portions: 4, ingredients: [], etapes: [] });
  });
});

describe('json — entrées hostiles', () => {
  it('refuse plus de 12 niveaux d’imbrication', () => {
    const profond = '{"a":' + '['.repeat(12) + ']'.repeat(12) + '}';
    const r = openDocument(enc(profond), recetteConfig);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('too_deep');
    const juste = '{"a":' + '['.repeat(11) + ']'.repeat(11) + '}';
    expect(openDocument(enc(juste), recetteConfig).ok).toBe(true);
  });

  it('refuse un fichier de plus de 8 Mio sans le décoder', () => {
    const r = openDocument(new Uint8Array(8 * 1024 * 1024 + 1), recetteConfig);
    expect(r).toEqual({ ok: false, code: 'too_large' });
  });

  it.each(['__proto__', 'constructor', 'prototype', '__pro\\u0074o__'])('refuse la clé %s, à toute profondeur', (k) => {
    const r = openDocument(enc(`{"titre":"x","a":{"b":[{"${k}":{"polluted":true}}]}}`), recetteConfig);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden_key');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuse le binaire et le JSON qui n’est pas un objet', () => {
    expect(openDocument(new Uint8Array([0xff, 0xfe, 0x00]), recetteConfig)).toMatchObject({ ok: false, code: 'not_utf8' });
    expect(openDocument(enc('[1,2]'), recetteConfig)).toMatchObject({ ok: false, code: 'not_object' });
    expect(openDocument(enc('{"a":'), recetteConfig)).toMatchObject({ ok: false, code: 'invalid_json' });
  });

  it('ouvre en lecture seule ce qu’enregistrer altérerait : clé en double, nombre trop précis', () => {
    expect(open('{"titre":"a","titre":"b"}', recetteConfig).readOnlyReasons).toEqual([{ code: 'duplicate_key', detail: 'titre' }]);
    expect(open('{"id": 12345678901234567890}', recetteConfig).readOnlyReasons).toEqual([
      { code: 'imprecise_number', detail: '12345678901234567890' },
    ]);
    expect(open('{"a": 1.50, "b": 9007199254740991}', recetteConfig).readOnlyReasons).toEqual([]);
  });
});

describe('csv — aller-retour', () => {
  const texte = '﻿article,quantite,prix,couleur,ok\r\n"Vis, 4mm", 10 ,0.05,gris,x\r\nÉcrou,5,0.1,"noir ""mat""",\r\n\r\nRondelle,,,bleu,\r\n';

  it('une ligne non touchée repart octet pour octet', () => {
    const doc = open(texte, inventaireConfig);
    expect(dec(doc.serialize())).toBe(dec(enc(texte)));
    const bytes = doc.serialize();
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('seule la cellule éditée change ; colonnes inconnues et lignes vides gardées', () => {
    const doc = open(texte, inventaireConfig);
    const rows = doc.root.list('rows');
    expect(rows.length()).toBe(3);
    const ecrou = rows.item(1)!;
    expect(getTyped(ecrou, 'ok', true)).toBe(false);
    setTyped(ecrou, 'quantite', 7, true);
    setTyped(ecrou, 'ok', true, true);
    const sortie = dec(doc.serialize()).replace(/^﻿/, '');
    expect(sortie).toBe('article,quantite,prix,couleur,ok\r\n"Vis, 4mm", 10 ,0.05,gris,x\r\nÉcrou,7,0.1,"noir ""mat""",x\r\n\r\nRondelle,,,bleu,\r\n');
  });

  it('ajouter une colonne déclarée absente réécrit l’en-tête et complète les lignes', () => {
    const doc = open('article,quantite\nvis,3\n', inventaireConfig);
    setTyped(doc.root.list('rows').item(0)!, 'prix', 1.5, true);
    expect(dec(doc.serialize())).toBe('article,quantite,prix\nvis,3,1.5\n');
  });

  it('CSV vide : l’en-tête vient des colonnes déclarées', () => {
    const doc = open('', inventaireConfig);
    const rows = doc.root.list('rows');
    rows.item(rows.add())!.set('article', 'clou');
    expect(dec(doc.serialize())).toBe('article,quantite,prix,ok\nclou,1,,\n');
  });

  it('séparateur « ; » : décimales à la virgule', () => {
    const conf = { ...inventaireConfig, format: { type: 'csv' as const, delimiter: ';' as const } };
    const doc = open('article;prix\nvis;0,05\n', conf);
    const r = doc.root.list('rows').item(0)!;
    expect(getTyped(r, 'prix', true)).toBe(0.05);
    setTyped(r, 'prix', 1.25, doc.ctx);
    expect(dec(doc.serialize())).toBe('article;prix\nvis;1,25\n');
  });

  it('refuse un en-tête « __proto__ »', () => {
    expect(openDocument(enc('__proto__,b\n1,2\n'), inventaireConfig)).toMatchObject({ ok: false, code: 'forbidden_key' });
  });
});

describe('lines — aller-retour', () => {
  const texte = '# Marché\n- [ ] tomates\n- [x] pain\nnote libre\n\n* [X] lait\n';

  it('garde puces, titres, notes ; seule la ligne cochée change', () => {
    const doc = open(texte, coursesConfig);
    const items = doc.root.list('items');
    expect(items.length()).toBe(3);
    expect(dec(doc.serialize())).toBe(texte);
    setTyped(items.item(0)!, 'done', true, true);
    expect(dec(doc.serialize())).toBe('# Marché\n- [x] tomates\n- [x] pain\nnote libre\n\n* [X] lait\n');
  });

  it('ajout après le dernier élément, avec sa puce ; retrait', () => {
    const doc = open(texte, coursesConfig);
    const items = doc.root.list('items');
    items.add('beurre');
    items.remove(1);
    expect(dec(doc.serialize())).toBe('# Marché\n- [ ] tomates\nnote libre\n\n* [X] lait\n* [ ] beurre\n');
  });

  it('un retour à la ligne saisi ne casse pas la ligne', () => {
    const doc = open('[ ] a\n', coursesConfig);
    doc.root.list('items').item(0)!.set('text', 'deux\nlignes');
    expect(dec(doc.serialize())).toBe('[ ] deux lignes\n');
  });
});

describe('keyvalue — aller-retour', () => {
  const texte = '# Fiche\nnom:   Ada Lovelace\nemail: ada@example.org\nnaissance: 1815\nnom: doublon gardé\n';

  it('champs inconnus, commentaires et doublons gardés ; préfixe d’origine conservé', () => {
    const doc = open(texte, contactConfig);
    expect(dec(doc.serialize())).toBe(texte);
    setTyped(doc.root, 'nom', 'Ada King', true);
    setTyped(doc.root, 'favori', true, true);
    setTyped(doc.root, 'tags', ['maths', 'machine'], true);
    expect(dec(doc.serialize())).toBe('# Fiche\nnom:   Ada King\nemail: ada@example.org\nnaissance: 1815\nnom: doublon gardé\nfavori: oui\ntags: maths, machine\n');
  });

  it('mode entries : renommer, ajouter, retirer des paires', () => {
    const doc = open('chiffrement: rendre illisible\n# remarque\nclé : un secret\n', glossaireConfig);
    const entries = doc.root.list('entries');
    expect(entries.length()).toBe(2);
    entries.item(1)!.set('key', 'clé privée');
    entries.add('signature');
    entries.item(2)!.set('value', 'preuve d’origine');
    entries.remove(0);
    expect(dec(doc.serialize())).toBe('# remarque\nclé privée: un secret\nsignature: preuve d’origine\n');
  });

  it('refuse une clé interdite', () => {
    expect(openDocument(enc('constructor: x\n'), contactConfig)).toMatchObject({ ok: false, code: 'forbidden_key' });
  });

  it('document neuf : seulement les valeurs par défaut déclarées', () => {
    const conf: NocodeConfig = { ...contactConfig, fields: [...contactConfig.fields, { key: 'pays', type: 'text', default: 'France' }] };
    const doc = open('', conf);
    expect(doc.isNew).toBe(true);
    expect(dec(doc.serialize())).toBe('pays: France\n');
  });
});
