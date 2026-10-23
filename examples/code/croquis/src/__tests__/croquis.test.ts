import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cheminSvg, croquisVide, ecrireCroquis, lireCroquis, prolonger, type Croquis } from '../croquis';
import { echapperHtml, exporterHtml, exporterJson, fonctions, vignette } from '../fonctions';
import { ajouterTrait, annuler, appliquer, effacerTout, historique, retablir, PROFONDEUR } from '../historique';
import { crc32, encoderPngIndexe } from '../png';

const racine = new URL('../../', import.meta.url);
const exemple = (nom: string) => new Uint8Array(readFileSync(new URL(`exemples/${nom}`, racine)));
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const lire = (o: Uint8Array): Croquis => {
  const lu = lireCroquis(o);
  if (!lu.ok) throw new Error('illisible');
  return lu.croquis;
};

/** Relit un PNG : morceaux, CRC, et pixels décompressés par zlib — un vrai décodeur. */
function decoderPng(o: Uint8Array) {
  expect([...o.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let p = 8;
  const morceaux: Record<string, Uint8Array> = {};
  while (p < o.length) {
    const n = v.getUint32(p);
    const type = String.fromCharCode(...o.slice(p + 4, p + 8));
    const donnees = o.slice(p + 8, p + 8 + n);
    expect(v.getUint32(p + 8 + n)).toBe(crc32(o.slice(p + 4, p + 8 + n)));
    morceaux[type] = donnees;
    p += 12 + n;
  }
  const ihdr = new DataView(morceaux.IHDR.buffer);
  const largeur = ihdr.getUint32(0);
  const hauteur = ihdr.getUint32(4);
  const brut = inflateSync(morceaux.IDAT);
  expect(brut.length).toBe(hauteur * (largeur + 1));
  return { largeur, hauteur, palette: morceaux.PLTE, brut };
}

describe('format .croquis', () => {
  it('0 octet = croquis neuf', () => {
    expect(lireCroquis(new Uint8Array(0))).toEqual({ ok: true, croquis: croquisVide(), repare: false });
  });

  it.each(['maison.croquis', 'spirale.croquis'])('relit et réécrit %s à l’octet près', (nom) => {
    const octets = exemple(nom);
    const lu = lireCroquis(octets);
    expect(lu.ok && lu.repare).toBe(false);
    expect(Buffer.from(ecrireCroquis(lire(octets)))).toEqual(Buffer.from(octets));
  });

  it('la graine du manifeste EST le croquis vide canonique', () => {
    const config = JSON.parse(readFileSync(new URL('filarr.extension.json', racine), 'utf8'));
    const graine = config.manifest.capabilities.newDocument[0].seed as string;
    expect(Buffer.from(graine, 'base64')).toEqual(Buffer.from(ecrireCroquis(croquisVide())));
  });

  it('refuse les formats inconnus et les versions futures', () => {
    expect(lireCroquis(new TextEncoder().encode('nope'))).toEqual({ ok: false, raison: 'json' });
    expect(lireCroquis(json({ format: 'filarr-croquis', version: 3, traits: [] }))).toEqual({ ok: false, raison: { version: 3 } });
  });

  it('borne un fichier fabriqué : couleurs, épaisseurs, points', () => {
    const lu = lireCroquis(
      json({
        format: 'filarr-croquis',
        version: 1,
        largeur: 100,
        hauteur: 50,
        fond: 'red',
        traits: [
          { couleur: 'javascript:alert(1)', epaisseur: 999, points: [-5, 10, 200.04, 80, 3] },
          { couleur: '#00ff00', epaisseur: 2, points: ['a', 1] },
          { couleur: '#00ff00', epaisseur: 2, points: [1.26, 2.24] },
        ],
      })
    );
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(true);
    expect(lu.croquis.fond).toBe('#ffffff');
    expect(lu.croquis.traits).toEqual([
      { couleur: '#000000', epaisseur: 64, points: [0, 10, 100, 50] },
      { couleur: '#00ff00', epaisseur: 2, points: [1.3, 2.2] },
    ]);
  });

  it('dessine un chemin SVG, et un point seul reste visible', () => {
    expect(cheminSvg({ couleur: '#000000', epaisseur: 2, points: [1, 2, 3, 4] })).toBe('M1 2L3 4');
    expect(cheminSvg({ couleur: '#000000', epaisseur: 2, points: [5, 5] })).toBe('M5 5l0.01 0');
  });

  it('ignore les micro-mouvements du pointeur', () => {
    let p = prolonger([], 10.04, 10);
    p = prolonger(p, 10.5, 10.5);
    p = prolonger(p, 20, 20);
    expect(p).toEqual([10, 10, 20, 20]);
  });
});

describe('historique', () => {
  it('annule, rétablit, et oublie le futur après un nouveau geste', () => {
    const t = { couleur: '#000000', epaisseur: 2, points: [1, 1] };
    let h = historique(croquisVide());
    h = appliquer(h, ajouterTrait(h.present, t));
    h = appliquer(h, ajouterTrait(h.present, t));
    expect(h.present.traits).toHaveLength(2);
    h = annuler(h);
    expect(h.present.traits).toHaveLength(1);
    h = retablir(h);
    expect(h.present.traits).toHaveLength(2);
    h = annuler(appliquer(annuler(h), effacerTout(h.present)));
    expect(h.futur).toHaveLength(1);
    expect(annuler(historique(croquisVide())).passe).toHaveLength(0);
  });

  it('borne sa profondeur', () => {
    let h = historique(croquisVide());
    for (let i = 0; i < PROFONDEUR + 20; i++) h = appliquer(h, ajouterTrait(h.present, { couleur: '#000000', epaisseur: 1, points: [i, i] }));
    expect(h.passe).toHaveLength(PROFONDEUR);
  });
});

describe('png', () => {
  it('encode une image indexée que zlib relit', () => {
    const png = encoderPngIndexe(3, 2, [[255, 255, 255], [255, 0, 0]], new Uint8Array([0, 1, 0, 1, 0, 1]));
    const d = decoderPng(png);
    expect([d.largeur, d.hauteur]).toEqual([3, 2]);
    expect([...d.brut]).toEqual([0, 0, 1, 0, 0, 1, 0, 1]);
    expect([...d.palette]).toEqual([255, 255, 255, 255, 0, 0]);
  });

  it('découpe en blocs stockés au-delà de 64 Kio', () => {
    const png = encoderPngIndexe(400, 400, [[0, 0, 0]], new Uint8Array(400 * 400));
    expect(decoderPng(png).brut.length).toBe(400 * 401);
  });
});

describe('fonctions pures', () => {
  it('la vignette est un PNG de 96 Kio au plus, aux proportions du dessin', () => {
    for (const nom of ['maison.croquis', 'spirale.croquis']) {
      const png = vignette(lire(exemple(nom)));
      expect(png.byteLength).toBeLessThanOrEqual(96 * 1024);
      const d = decoderPng(png);
      expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(160);
      // Le dessin y est : des pixels qui ne sont pas le fond.
      expect([...d.brut].some((x, i) => i % (d.largeur + 1) !== 0 && x !== 0)).toBe(true);
    }
  });

  it('exporte une page web autonome, sans rien interpréter du nom de fichier', () => {
    const html = new TextDecoder().decode(exporterHtml(lire(exemple('maison.croquis')), '<b>maison</b>.croquis'));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('&#60;b&#62;maison&#60;/b&#62;');
    expect(html).not.toContain('<b>');
    expect(html.match(/<path /g)).toHaveLength(7);
    expect(echapperHtml(`"'&`)).toBe('&#34;&#39;&#38;');
  });

  it('exporte du JSON en paires de points', () => {
    const sortie = JSON.parse(new TextDecoder().decode(exporterJson(lire(exemple('maison.croquis')))));
    expect(sortie.traits[6].points).toEqual([[960, 300]]);
  });

  it('route export selon ctx.to, et rejette un fichier illisible', () => {
    const ctx = { fileName: 'm.croquis', locale: 'fr' };
    expect(() => fonctions.export!(new TextEncoder().encode('x'), { ...ctx, to: 'json' })).toThrow();
    expect(() => fonctions.export!(exemple('maison.croquis'), { ...ctx, to: 'csv' })).toThrow();
    expect(fonctions.thumbnail!(new Uint8Array(0), ctx)).toBeInstanceOf(Uint8Array);
  });
});
