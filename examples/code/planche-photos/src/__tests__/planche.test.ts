import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dataUrl, depuisBase64, dimensions, lireDataUrl, reduction, typeImage, versBase64 } from '../images';
import { deplacer, ecrirePlanche, lirePlanche, plancheVide, type Photo } from '../planche';
import { TEL_QUEL_MAX, reduire } from '../reduction';

const fichier = (nom: string) => new Uint8Array(readFileSync(new URL(`../../exemples/${nom}`, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);
const manifeste = JSON.parse(readFileSync(new URL('../../filarr.extension.json', import.meta.url), 'utf8')).manifest;

describe('reconnaître une image par ses octets', () => {
  it('PNG, JPEG, WebP — et refuse un faux .png', () => {
    expect(typeImage(fichier('photos/phare.png'))).toBe('png');
    expect(typeImage(fichier('photos/galet.jpg'))).toBe('jpeg');
    expect(typeImage(fichier('photos/algue.webp'))).toBe('webp');
    expect(typeImage(fichier('photos/pas-une-image.png'))).toBeNull();
  });

  it('lit les dimensions dans l’en-tête, sans décoder les pixels', () => {
    expect(dimensions(fichier('photos/phare.png'))).toEqual({ largeur: 96, hauteur: 64 });
    expect(dimensions(fichier('photos/ile.png'))).toEqual({ largeur: 80, hauteur: 80 });
    expect(dimensions(fichier('photos/galet.jpg'))).toEqual({ largeur: 1, hauteur: 1 });
    expect(dimensions(fichier('photos/algue.webp'))).toEqual({ largeur: 1, hauteur: 1 });
    expect(dimensions(fichier('photos/phare.png').slice(0, 20))).toBeNull();
  });

  it('réduit sans agrandir', () => {
    expect(reduction(4000, 3000, 480)).toEqual({ largeur: 480, hauteur: 360 });
    expect(reduction(100, 50, 480)).toEqual({ largeur: 100, hauteur: 50 });
  });

  it('base64 aller-retour, y compris au-delà d’un tronçon', () => {
    const o = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(depuisBase64(versBase64(o))).toEqual(o);
    expect(depuisBase64('%%%')).toBeNull();
  });
});

describe('une data URL n’entre dans un src que si elle prouve ce qu’elle annonce', () => {
  const png = fichier('photos/phare.png');
  it('accepte le bon type, refuse le mensonge et le reste', () => {
    expect(lireDataUrl(dataUrl(png, 'png'), 1e6)?.type).toBe('png');
    expect(lireDataUrl(dataUrl(png, 'png').replace('image/png', 'image/jpeg'), 1e6)).toBeNull();
    expect(lireDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 1e6)).toBeNull();
    expect(lireDataUrl('javascript:alert(1)', 1e6)).toBeNull();
    expect(lireDataUrl(dataUrl(png, 'png'), 100)).toBeNull();
  });
});

describe('format .planche', () => {
  it.each(['bretagne.planche', 'vide-titre.planche'])('relit et réécrit %s à l’octet près', (nom) => {
    const o = fichier(nom);
    const lu = lirePlanche(o);
    if (!lu.ok) throw new Error('illisible');
    expect(lu.repare).toBe(false);
    expect(Buffer.from(ecrirePlanche(lu.planche))).toEqual(Buffer.from(o));
  });

  it('0 octet = planche neuve ; une image qui ment est écartée', () => {
    expect(lirePlanche(new Uint8Array(0))).toEqual({ ok: true, planche: plancheVide(), repare: false });
    const faux = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
    const lu = lirePlanche(enc(JSON.stringify({ format: 'filarr-planche', version: 1, titre: 'x', colonnes: 9, photos: [{ id: 'a', nom: 'x', legende: '', largeur: 1, hauteur: 1, image: faux }] })));
    expect(lu.ok && lu.planche.photos).toEqual([]);
    expect(lu.ok && lu.planche.colonnes).toBe(3);
    expect(lu.ok && lu.repare).toBe(true);
  });

  it('déplace sans sortir de la liste', () => {
    const p = (id: string) => ({ id }) as Photo;
    const l = [p('a'), p('b'), p('c')];
    expect(deplacer(l, 0, 1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(deplacer(l, 0, -1)).toBe(l);
    expect(deplacer(l, 2, 1)).toBe(l);
  });

  it('ne garde jamais de poignée : le fichier ne connaît que des copies', () => {
    const texte = new TextDecoder().decode(fichier('bretagne.planche'));
    expect(texte).not.toMatch(/handle|poign/i);
  });
});

describe('réduction sans canvas (repli)', () => {
  it('embarque une petite image telle quelle, refuse une grande et une illisible', async () => {
    const png = fichier('photos/phare.png');
    await expect(reduire(png, 'png', 480)).resolves.toEqual({ image: dataUrl(png, 'png'), largeur: 96, hauteur: 64 });
    const grand = new Uint8Array(TEL_QUEL_MAX + 1);
    grand.set(png.slice(0, 33));
    await expect(reduire(grand, 'png', 480)).rejects.toThrow('image_trop_grande');
    await expect(reduire(png.slice(0, 12), 'png', 480)).rejects.toThrow('image_illisible');
  });
});

describe('manifeste', () => {
  it('ne demande que la lecture, et seulement des images', () => {
    expect(manifeste.capabilities).toEqual({ picker: { access: 'read', extensions: ['png', 'jpg', 'jpeg', 'webp'] } });
  });
});
