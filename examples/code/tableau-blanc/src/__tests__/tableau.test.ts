import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DISTANT, LOCAL, ouvrirSalle, semerParLots } from '../salle';
import { deplace, depuisDoc, ecrireTableau, elementsDe, lireElement, lireTableau, ordonner, poser, tableauVide, type Tableau } from '../tableau';

const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const lire = (o: Uint8Array): Tableau => {
  const lu = lireTableau(o);
  if (!lu.ok) throw new Error('illisible');
  return lu.tableau;
};

/** Un faux `host` en salle, construit comme la page bac à sable construit `host.collab`. */
function hoteEnSalle(o: { seed: boolean; updates?: Uint8Array[]; readOnly?: boolean; octets?: Uint8Array }) {
  const envoyees: Uint8Array[] = [];
  const ecouteurs: ((u: Uint8Array) => void)[] = [];
  let semis = 0;
  const host = {
    readOnly: !!o.readOnly,
    collab: {
      seed: o.seed,
      initialUpdates: o.updates ?? [],
      isResponsible: () => false,
      onResponsibleChange: () => () => undefined,
      onRemoteUpdate(cb: (u: Uint8Array) => void) {
        ecouteurs.push(cb);
        return () => ecouteurs.splice(ecouteurs.indexOf(cb), 1);
      },
      sendUpdate(u: Uint8Array) {
        if (o.readOnly) throw new Error('read_only');
        envoyees.push(u);
      },
      seeded: () => void semis++,
    },
  } as unknown as FilarrHost;
  return { host, envoyees, livrer: (u: Uint8Array) => ecouteurs.forEach((cb) => cb(u)), semis: () => semis, ecouteurs };
}

describe('format .tableau', () => {
  it.each(['atelier.tableau', 'plan-salon.tableau'])('relit et réécrit %s à l’octet près', (nom) => {
    const o = exemple(nom);
    const lu = lireTableau(o);
    expect(lu.ok && lu.repare).toBe(false);
    expect(Buffer.from(ecrireTableau(lire(o)))).toEqual(Buffer.from(o));
  });

  it('0 octet = tableau neuf ; version future refusée', () => {
    expect(lireTableau(new Uint8Array(0))).toEqual({ ok: true, tableau: tableauVide(), repare: false });
    const futur = new TextEncoder().encode(JSON.stringify({ format: 'filarr-tableau', version: 9, elements: [] }));
    expect(lireTableau(futur)).toEqual({ ok: false, raison: { version: 9 } });
  });

  it('revalide un élément venu d’un pair qu’on ne contrôle pas', () => {
    expect(lireElement({ id: '<b>', type: 'texte' })).toBeNull();
    expect(lireElement({ id: 'a', type: 'image', src: 'x' })).toBeNull();
    expect(lireElement({ id: 'a', type: 'texte', z: 1, couleur: 'url(x)', x: -5, y: 1e9, texte: 'a\nb' })).toEqual({
      id: 'a',
      type: 'texte',
      z: 1,
      couleur: '#1f2937',
      x: 0,
      y: 1000,
      texte: 'a b',
    });
  });

  it('ordonne par z, puis par id : le même ordre chez tous les pairs', () => {
    const e = (id: string, z: number) => lireElement({ id, type: 'texte', z, x: 0, y: 0, texte: '' })!;
    expect(ordonner([e('b', 1), e('a', 1), e('c', 0)]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('déplace en restant sur la surface', () => {
    const t = lireElement({ id: 't', type: 'trait', z: 0, points: [10, 10, 20, 20] })!;
    expect(deplace(t, -50, 5)).toMatchObject({ points: [0, 15, 0, 25] });
  });
});

describe('la salle, selon API.md §3', () => {
  const fichier = lire(exemple('atelier.tableau'));

  it('seul : le fichier devient le document, rien ne part', () => {
    const s = ouvrirSalle({ readOnly: false } as FilarrHost, fichier, () => undefined);
    expect(s.enSalle).toBe(false);
    expect(Buffer.from(ecrireTableau(depuisDoc(s.doc)))).toEqual(Buffer.from(exemple('atelier.tableau')));
    s.detruire();
  });

  it('la page qui sème envoie le semis, puis seeded() une fois', () => {
    const a = hoteEnSalle({ seed: true });
    const s = ouvrirSalle(a.host, fichier, () => undefined);
    expect(a.semis()).toBe(1);
    expect(a.envoyees.length).toBeGreaterThan(0);
    // Une autre page, qui ne sème pas, rejoint avec ce que la salle contient.
    const b = hoteEnSalle({ seed: false, updates: a.envoyees });
    const sb = ouvrirSalle(b.host, tableauVide(), () => undefined);
    expect(b.semis()).toBe(0);
    expect(b.envoyees).toHaveLength(0);
    expect(depuisDoc(sb.doc)).toEqual(depuisDoc(s.doc));
    s.detruire();
    sb.detruire();
    expect(b.ecouteurs).toHaveLength(0);
  });

  it('une update des autres s’applique et ne repart pas ; la nôtre part', () => {
    const a = hoteEnSalle({ seed: false });
    const s = ouvrirSalle(a.host, tableauVide(), () => undefined);
    const ailleurs = new Y.Doc();
    poser(ailleurs, lireElement({ id: 'loin', type: 'texte', z: 0, x: 1, y: 1, texte: 'salut' })!, 'x');
    a.livrer(Y.encodeStateAsUpdate(ailleurs));
    expect(elementsDe(s.doc).get('loin')).toBeTruthy();
    expect(a.envoyees).toHaveLength(0);
    poser(s.doc, lireElement({ id: 'ici', type: 'texte', z: 1, x: 1, y: 1, texte: 'moi' })!, LOCAL);
    expect(a.envoyees).toHaveLength(1);
    s.detruire();
  });

  it('un lecteur n’envoie rien, même invité à semer', () => {
    const a = hoteEnSalle({ seed: true, readOnly: true });
    const refus: string[] = [];
    const s = ouvrirSalle(a.host, fichier, (c) => refus.push(c));
    expect(a.envoyees).toHaveLength(0);
    expect(a.semis()).toBe(0);
    expect(refus).toEqual([]);
    expect(depuisDoc(s.doc).elements).toHaveLength(fichier.elements.length);
    s.detruire();
  });

  it('deux semis concurrents ne doublent rien', () => {
    const x = new Y.Doc();
    const y = new Y.Doc();
    semerParLots(x, fichier);
    semerParLots(y, fichier);
    Y.applyUpdate(x, Y.encodeStateAsUpdate(y));
    Y.applyUpdate(y, Y.encodeStateAsUpdate(x));
    expect(depuisDoc(x)).toEqual(depuisDoc(y));
    expect(depuisDoc(x).elements).toHaveLength(fichier.elements.length);
  });

  it('sème par lots sous le plafond d’1 Mio par update', () => {
    const gros: Tableau = {
      largeur: 1600,
      hauteur: 1000,
      elements: Array.from({ length: 400 }, (_, i) => lireElement({ id: `t${i}`, type: 'trait', z: i, points: Array.from({ length: 2000 }, (_, k) => (k * 7 + i) % 1000) })!),
    };
    const a = hoteEnSalle({ seed: true });
    const s = ouvrirSalle(a.host, gros, () => undefined);
    expect(a.envoyees.length).toBeGreaterThan(1);
    expect(Math.max(...a.envoyees.map((u) => u.byteLength))).toBeLessThan(1024 * 1024);
    s.detruire();
  });

  it('annuler ne défait que nos gestes, pas ceux des autres', () => {
    const doc = new Y.Doc();
    const h = new Y.UndoManager(elementsDe(doc), { trackedOrigins: new Set([LOCAL]) });
    poser(doc, lireElement({ id: 'moi', type: 'texte', z: 0, x: 0, y: 0, texte: 'a' })!, LOCAL);
    const autre = new Y.Doc();
    poser(autre, lireElement({ id: 'autre', type: 'texte', z: 1, x: 0, y: 0, texte: 'b' })!, 'x');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(autre), DISTANT);
    h.undo();
    expect([...elementsDe(doc).keys()]).toEqual(['autre']);
  });
});
